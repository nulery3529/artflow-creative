export async function askAdvisorAI(message, businessContext, history = []) {
  const response = await fetch('/api/advisor-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      businessContext,
      history: Array.isArray(history) ? history.slice(-12) : [],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error || 'The AI Advisor could not answer right now.');
    error.code = data?.code || '';
    throw error;
  }
  return data;
}

export async function getAdvisorAIStatus() {
  const response = await fetch('/api/advisor-chat', { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Could not check AI connection');
  return data;
}
