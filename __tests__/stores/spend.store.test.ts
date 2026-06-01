import { act } from '@testing-library/react-native';
import { useSpendStore } from '@/stores/spend.store';

jest.mock('@/services/supabase', () => ({
  supabase: {
    from: jest.fn(),
    storage: { from: jest.fn() },
    functions: { invoke: jest.fn() },
  },
}));

// Mock global fetch used to read file URI into an ArrayBuffer
global.fetch = jest.fn().mockResolvedValue({
  arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
});

import { supabase } from '@/services/supabase';

const mockAnalysis = {
  id: 'analysis-1',
  statement_file_path: 'user-123/1234567_statement.pdf',
  avg_monthly_spend: 52000,
  effective_avg_monthly_spend: 52000,
  analysis_period_months: 3,
  category_breakdown: { food: 14000, transport: 8000, shopping: 12000 },
  monthly_trend: [{ month: '2026-01', amount: 52000 }],
  insights: ['You spend too much on food'],
  outlier_transactions: [],
  ignored_transaction_ids: [],
};

beforeEach(() => {
  useSpendStore.setState({ analysis: null, uploading: false, loading: false });
  jest.clearAllMocks();
});

describe('useSpendStore — setAnalysis', () => {
  it('stores analysis in state', () => {
    useSpendStore.getState().setAnalysis(mockAnalysis);
    expect(useSpendStore.getState().analysis).toEqual(mockAnalysis);
  });
});

describe('useSpendStore — fetchAnalysis', () => {
  it('fetches and stores the most recent analysis', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: mockAnalysis, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await act(async () => {
      await useSpendStore.getState().fetchAnalysis('user-123');
    });

    expect(supabase.from).toHaveBeenCalledWith('spend_analyses');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-123');
    expect(useSpendStore.getState().analysis).toEqual(mockAnalysis);
    expect(useSpendStore.getState().loading).toBe(false);
  });

  it('stores null when no analysis exists', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await act(async () => {
      await useSpendStore.getState().fetchAnalysis('user-123');
    });

    expect(useSpendStore.getState().analysis).toBeNull();
  });
});

describe('useSpendStore — uploadAndAnalyze', () => {
  const edgeFnResult = {
    avgMonthlySpend: 52000,
    periodMonths: 3,
    categoryBreakdown: { food: 14000, transport: 8000 },
    monthlyTrend: [{ month: '2026-01', amount: 52000 }],
    insights: ['Spend insight'],
  };

  const setupMocks = (overrides: { uploadError?: Error; edgeError?: Error } = {}) => {
    const storageMock = {
      upload: jest.fn().mockResolvedValue({ error: overrides.uploadError ?? null }),
    };
    (supabase.storage.from as jest.Mock).mockReturnValue(storageMock);

    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: overrides.edgeError ? null : edgeFnResult,
      error: overrides.edgeError ?? null,
    });

    const insertChain = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: mockAnalysis, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(insertChain);

    return { storageMock, insertChain };
  };

  it('sets uploading=true then false on success', async () => {
    setupMocks();
    let uploadingDuring = false;

    const originalUpload = (supabase.storage.from as jest.Mock).getMockImplementation();
    (supabase.storage.from as jest.Mock).mockImplementation((bucket: string) => ({
      upload: jest.fn().mockImplementation(async () => {
        uploadingDuring = useSpendStore.getState().uploading;
        return { error: null };
      }),
    }));

    await act(async () => {
      await useSpendStore.getState().uploadAndAnalyze('user-123', 'file://test.pdf', 'statement.pdf');
    });

    expect(uploadingDuring).toBe(true);
    expect(useSpendStore.getState().uploading).toBe(false);
  });

  it('uploads file to Supabase Storage with correct bucket', async () => {
    const { storageMock } = setupMocks();

    await act(async () => {
      await useSpendStore.getState().uploadAndAnalyze('user-123', 'file://test.pdf', 'statement.pdf');
    });

    expect(supabase.storage.from).toHaveBeenCalledWith('statements');
    expect(storageMock.upload).toHaveBeenCalledWith(
      expect.stringContaining('user-123/'),
      expect.any(ArrayBuffer),
      expect.objectContaining({ contentType: 'application/pdf' })
    );
  });

  it('invokes parse-credit-card-pdf edge function', async () => {
    setupMocks();

    await act(async () => {
      await useSpendStore.getState().uploadAndAnalyze('user-123', 'file://test.pdf', 'statement.pdf');
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      'parse-credit-card-pdf',
      expect.objectContaining({ body: expect.objectContaining({ userId: 'user-123' }) })
    );
  });

  it('saves result to spend_analyses and updates state', async () => {
    const { insertChain } = setupMocks();

    await act(async () => {
      await useSpendStore.getState().uploadAndAnalyze('user-123', 'file://test.pdf', 'statement.pdf');
    });

    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        avg_monthly_spend: edgeFnResult.avgMonthlySpend,
        category_breakdown: edgeFnResult.categoryBreakdown,
      })
    );
    expect(useSpendStore.getState().analysis).toEqual(mockAnalysis);
  });

  it('clears uploading even when upload fails', async () => {
    setupMocks({ uploadError: new Error('Upload failed') });

    await act(async () => {
      try {
        await useSpendStore.getState().uploadAndAnalyze('user-123', 'file://test.pdf', 'statement.pdf');
      } catch {
        // expected to throw
      }
    });

    expect(useSpendStore.getState().uploading).toBe(false);
  });

  it('clears uploading even when edge function fails', async () => {
    setupMocks({ edgeError: new Error('Edge function error') });

    await act(async () => {
      try {
        await useSpendStore.getState().uploadAndAnalyze('user-123', 'file://test.pdf', 'statement.pdf');
      } catch {
        // expected to throw
      }
    });

    expect(useSpendStore.getState().uploading).toBe(false);
  });

  it('throws PASSWORD_PROTECTED and stores pendingFile when PDF is encrypted', async () => {
    (global.TextDecoder as any) = jest.fn().mockImplementation(() => ({
      decode: jest.fn().mockReturnValue('/Encrypt some encrypted pdf content'),
    }));

    await act(async () => {
      try {
        await useSpendStore.getState().uploadAndAnalyze('user-123', 'file://encrypted.pdf', 'encrypted.pdf');
      } catch (e: any) {
        expect(e.code).toBe('PASSWORD_PROTECTED');
      }
    });

    expect(useSpendStore.getState().pendingFile).toEqual({
      uri: 'file://encrypted.pdf',
      name: 'encrypted.pdf',
    });

    // restore
    (global.TextDecoder as any) = jest.fn().mockImplementation(() => ({
      decode: jest.fn().mockReturnValue('normal pdf content'),
    }));
  });
});

describe('useSpendStore — analyzeWithPassword', () => {
  const edgeFnResult = {
    avgMonthlySpend: 52000,
    periodMonths: 3,
    categoryBreakdown: { food: 14000 },
    monthlyTrend: [{ month: '2026-01', amount: 52000 }],
    insights: ['Insight'],
  };

  it('throws when there is no pending file', async () => {
    useSpendStore.setState({ pendingFile: null });

    await expect(
      act(async () => {
        await useSpendStore.getState().analyzeWithPassword('user-123', 'pass123');
      })
    ).rejects.toThrow('No pending file to unlock');
  });

  it('unlocks and analyzes the pending file with the provided password', async () => {
    useSpendStore.setState({
      pendingFile: { uri: 'file://locked.pdf', name: 'locked.pdf' },
    });

    const storageMock = {
      upload: jest.fn().mockResolvedValue({ error: null }),
    };
    (supabase.storage.from as jest.Mock).mockReturnValue(storageMock);
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: edgeFnResult,
      error: null,
    });
    const insertChain = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: mockAnalysis, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(insertChain);

    await act(async () => {
      await useSpendStore.getState().analyzeWithPassword('user-123', 'correctpass');
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      'parse-credit-card-pdf',
      expect.objectContaining({
        body: expect.objectContaining({ password: 'correctpass' }),
      })
    );
    expect(useSpendStore.getState().analysis).toEqual(mockAnalysis);
    expect(useSpendStore.getState().uploading).toBe(false);
  });

  it('clears uploading even when analyzeWithPassword fails', async () => {
    useSpendStore.setState({
      pendingFile: { uri: 'file://locked.pdf', name: 'locked.pdf' },
    });

    const storageMock = {
      upload: jest.fn().mockResolvedValue({ error: new Error('Upload failed') }),
    };
    (supabase.storage.from as jest.Mock).mockReturnValue(storageMock);

    await act(async () => {
      try {
        await useSpendStore.getState().analyzeWithPassword('user-123', 'wrongpass');
      } catch {
        // expected
      }
    });

    expect(useSpendStore.getState().uploading).toBe(false);
  });
});

describe('useSpendStore — toggleIgnore', () => {
  const updateChain = {
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockResolvedValue({ error: null }),
  };

  beforeEach(() => {
    (supabase.from as jest.Mock).mockReturnValue(updateChain);
    updateChain.update.mockReturnThis();
    updateChain.eq.mockResolvedValue({ error: null });
  });

  it('does nothing when analysis has no id', async () => {
    useSpendStore.setState({
      analysis: { ...mockAnalysis, id: undefined },
    });

    await act(async () => {
      await useSpendStore.getState().toggleIgnore('tx-1');
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('adds a transaction id to ignored list', async () => {
    useSpendStore.setState({ analysis: { ...mockAnalysis, ignored_transaction_ids: [] } });

    await act(async () => {
      await useSpendStore.getState().toggleIgnore('tx-abc');
    });

    expect(useSpendStore.getState().analysis?.ignored_transaction_ids).toContain('tx-abc');
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ ignored_transaction_ids: ['tx-abc'] })
    );
  });

  it('removes a transaction id that was already ignored', async () => {
    useSpendStore.setState({
      analysis: { ...mockAnalysis, ignored_transaction_ids: ['tx-abc', 'tx-xyz'] },
    });

    await act(async () => {
      await useSpendStore.getState().toggleIgnore('tx-abc');
    });

    expect(useSpendStore.getState().analysis?.ignored_transaction_ids).not.toContain('tx-abc');
    expect(useSpendStore.getState().analysis?.ignored_transaction_ids).toContain('tx-xyz');
  });

  it('handles null ignored_transaction_ids and null outlier_transactions gracefully', async () => {
    useSpendStore.setState({
      analysis: {
        ...mockAnalysis,
        ignored_transaction_ids: null as any,
        outlier_transactions: null as any,
        analysis_period_months: 0,
      },
    });

    await act(async () => {
      await useSpendStore.getState().toggleIgnore('tx-new');
    });

    expect(useSpendStore.getState().analysis?.ignored_transaction_ids).toContain('tx-new');
  });
});
