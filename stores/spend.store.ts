import { create } from 'zustand';
import { supabase } from '@/services/supabase';

export interface OutlierTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  month: string;
}

interface SpendAnalysis {
  id?: string;
  statement_file_path: string;
  avg_monthly_spend: number;
  effective_avg_monthly_spend: number;
  analysis_period_months: number;
  category_breakdown: Record<string, number>;
  monthly_trend: Array<{ month: string; amount: number }>;
  insights: string[];
  outlier_transactions: OutlierTransaction[];
  ignored_transaction_ids: string[];
}

interface SpendState {
  analysis: SpendAnalysis | null;
  uploading: boolean;
  loading: boolean;
  pendingFile: { uri: string; name: string } | null;
  setAnalysis: (analysis: SpendAnalysis) => void;
  fetchAnalysis: (userId: string) => Promise<void>;
  uploadAndAnalyze: (userId: string, fileUri: string, fileName: string) => Promise<void>;
  analyzeWithPassword: (userId: string, password: string) => Promise<void>;
  toggleIgnore: (transactionId: string) => Promise<void>;
}

async function extractFunctionError(error: any): Promise<{ code: string; message: string }> {
  let code = '';
  let message = error.message ?? 'Failed to analyze PDF';
  try {
    const body = await error.context?.json?.();
    if (body?.error) { code = body.error; message = body.error; }
  } catch {}
  return { code, message };
}

async function saveResult(userId: string, filePath: string, data: any) {
  const { data: saved } = await supabase
    .from('spend_analyses')
    .insert({
      user_id: userId,
      statement_file_path: filePath,
      avg_monthly_spend: data.avgMonthlySpend,
      effective_avg_monthly_spend: data.avgMonthlySpend,
      analysis_period_months: data.periodMonths,
      category_breakdown: data.categoryBreakdown,
      monthly_trend: data.monthlyTrend,
      insights: data.insights,
      outlier_transactions: data.outlierTransactions ?? [],
      ignored_transaction_ids: [],
    })
    .select()
    .single();
  return saved;
}

export const useSpendStore = create<SpendState>((set, get) => {
  async function doUploadAndAnalyze(
    userId: string,
    fileUri: string,
    fileName: string,
    password?: string
  ) {
    const filePath = `${userId}/${Date.now()}_${fileName}`;

    const fileResponse = await fetch(fileUri);
    const buffer = await fileResponse.arrayBuffer();

    if (!password) {
      const rawPdf = new TextDecoder().decode(new Uint8Array(buffer));
      if (rawPdf.includes('/Encrypt')) {
        set({ pendingFile: { uri: fileUri, name: fileName } });
        throw Object.assign(new Error('PASSWORD_PROTECTED'), { code: 'PASSWORD_PROTECTED' });
      }
    }

    const { error: uploadError } = await supabase.storage
      .from('statements')
      .upload(filePath, buffer, { contentType: 'application/pdf', upsert: true });
    if (uploadError) throw uploadError;

    const { data, error } = await supabase.functions.invoke('parse-credit-card-pdf', {
      body: { filePath, userId, ...(password ? { password } : {}) },
    });

    if (error) {
      const { code, message } = await extractFunctionError(error);
      if (code === 'WRONG_PASSWORD') throw new Error('Incorrect password. Please try again.');
      throw new Error(message);
    }

    const saved = await saveResult(userId, filePath, data);
    if (saved) set({ analysis: saved, pendingFile: null });
  }

  return {
    analysis: null,
    uploading: false,
    loading: false,
    pendingFile: null,

    setAnalysis: (analysis) => set({ analysis }),

    fetchAnalysis: async (userId) => {
      set({ loading: true });
      const { data } = await supabase
        .from('spend_analyses')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      set({ analysis: data ?? null, loading: false });
    },

    uploadAndAnalyze: async (userId, fileUri, fileName) => {
      set({ uploading: true });
      try {
        await doUploadAndAnalyze(userId, fileUri, fileName);
      } finally {
        set({ uploading: false });
      }
    },

    analyzeWithPassword: async (userId, password) => {
      const pendingFile = get().pendingFile;
      if (!pendingFile) throw new Error('No pending file to unlock');
      set({ uploading: true });
      try {
        await doUploadAndAnalyze(userId, pendingFile.uri, pendingFile.name, password);
      } finally {
        set({ uploading: false });
      }
    },

    toggleIgnore: async (transactionId) => {
      const analysis = get().analysis;
      if (!analysis?.id) return;

      const current = analysis.ignored_transaction_ids ?? [];
      const next = current.includes(transactionId)
        ? current.filter((id) => id !== transactionId)
        : [...current, transactionId];

      const nextIgnoredSet = new Set(next);
      const ignoredTotal = (analysis.outlier_transactions ?? [])
        .filter((o) => nextIgnoredSet.has(o.id))
        .reduce((s, o) => s + o.amount, 0);
      const periodMonths = analysis.analysis_period_months || 1;
      const effectiveAvg = Math.round(
        Math.max(0, analysis.avg_monthly_spend * periodMonths - ignoredTotal) / periodMonths
      );

      set({
        analysis: {
          ...analysis,
          ignored_transaction_ids: next,
          effective_avg_monthly_spend: effectiveAvg,
        },
      });

      await supabase
        .from('spend_analyses')
        .update({ ignored_transaction_ids: next, effective_avg_monthly_spend: effectiveAvg })
        .eq('id', analysis.id);
    },
  };
});
