import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key';

export function getUserFromRequest(request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const tokenMatch = cookieHeader.match(/token=([^;]+)/);
  
  if (!tokenMatch) {
    return null;
  }

  try {
    const token = tokenMatch[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    return { id: decoded.id, username: decoded.username };
  } catch (e) {
    return null;
  }
}
