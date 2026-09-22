export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(410).json({
    ok: false,
    retired: true,
    code: 'SPREADSHEET_TRACKER_RETIRED',
    message: 'The Google Sheets tracker has been retired. Art Flow Creative now stores live business data directly in Neon.'
  });
}
