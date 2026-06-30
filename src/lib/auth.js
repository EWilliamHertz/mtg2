import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET environment variable is not set.");
}
const JWT_SECRET = process.env.JWT_SECRET;

export function getUserFromRequest(request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const tokenMatch = cookieHeader.match(/hatake_session=([^;]+)/);
  
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
