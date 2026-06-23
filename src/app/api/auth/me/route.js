import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key';

export async function GET(request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const tokenMatch = cookieHeader.match(/token=([^;]+)/);
  
  if (!tokenMatch) {
    return Response.json({ user: null });
  }

  try {
    const token = tokenMatch[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    return Response.json({ user: { id: decoded.id, username: decoded.username } });
  } catch (e) {
    return Response.json({ user: null });
  }
}

export async function POST(request) {
  // Logout
  const response = Response.json({ success: true });
  response.headers.set('Set-Cookie', `token=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict`);
  return response;
}
