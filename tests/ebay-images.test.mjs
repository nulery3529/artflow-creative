import test from 'node:test';
import assert from 'node:assert/strict';
import { ebayImageUrl } from '../api/yahoo-mail.mjs';

test('preserves legacy eBay photo URLs with base64 padding in quoted-printable mail', () => {
  const raw = '<img src=3D"https://i.ebayimg.com/00/s/NDhYNDg=3D/z/PHOTO/$_0.=\r\nJPG" alt=3D"Framed cat print">';
  assert.equal(ebayImageUrl('', 'Framed cat print', raw),
    'https://i.ebayimg.com/00/s/NDhYNDg=/z/PHOTO/$_0.JPG');
});

test('does not select a truncated legacy URL that returns a placeholder', () => {
  const html = '<img src="https://i.ebayimg.com/00/s/NDhYNDg" alt="Framed cat print">';
  assert.equal(ebayImageUrl(html, 'Framed cat print'), '');
});

test('keeps the matching artwork image ahead of unrelated email graphics', () => {
  const photo = 'https://i.ebayimg.com/images/g/PHOTO/s-l500.jpg';
  const html = `<img src="https://i.ebayimg.com/images/g/APP/s-l500.jpg" alt="Download eBay app"><img src="${photo}" alt="Framed cat print">`;
  assert.equal(ebayImageUrl(html, 'Framed cat print'), photo);
});
