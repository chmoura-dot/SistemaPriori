import dotenv from 'dotenv'

dotenv.config({ path: '.env' })

async function test() {
  const url = `${process.env.VITE_SUPABASE_URL}/functions/v1/invite-psychologist`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({ email: 'test@example.com' })
  })
  
  console.log('Status:', res.status)
  const text = await res.text()
  console.log('Body:', text)
}
test()
