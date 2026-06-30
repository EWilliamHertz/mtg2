import prisma from '../../../lib/db.js';

export async function GET() {
  try {
    const count = await prisma.cardReference.count();
    return Response.json({ cardCount: count });
  } catch (error) {
    return Response.json({ cardCount: 0 });
  }
}
