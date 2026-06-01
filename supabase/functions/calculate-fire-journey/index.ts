const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { fireNumber, currentSavings, monthlySavings, expectedReturnPct, currentAge } =
      await req.json();

    if (!fireNumber || monthlySavings == null) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const annualSavings = monthlySavings * 12;
    const r = expectedReturnPct / 100;
    let years = 0;
    let wealth = currentSavings ?? 0;
    const maxYears = 100;

    while (wealth < fireNumber && years < maxYears) {
      wealth = wealth * (1 + r) + annualSavings;
      years++;
    }

    const yearsToFire = years >= maxYears ? 999 : years;
    const retireAtAge = currentAge + yearsToFire;

    // Build timeline
    const timeline = [];
    let w = currentSavings ?? 0;
    const end = Math.min(yearsToFire + 5, 50);
    for (let i = 0; i <= end; i++) {
      timeline.push({ year: i, wealth: Math.round(w), age: currentAge + i });
      w = w * (1 + r) + annualSavings;
    }

    return new Response(
      JSON.stringify({ yearsToFire, retireAtAge, timeline }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
