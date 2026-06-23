import fetch from 'node-fetch';
async function test() {
  const res = await fetch('http://localhost:3000/api/decks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test', format: 'Standard', cards: {} })
  });
  console.log(res.status, await res.text());
}
test();
