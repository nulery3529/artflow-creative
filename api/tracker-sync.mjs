export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(410).json({
    ok: false,
    retired: true,
    code: 'SPREADSHEET_SYNC_RETIRED',
    message: 'Google Sheets syncing has been retired. Art Flow Creative now stores live business data directly in Neon.'
  });
}
