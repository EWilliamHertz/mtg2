import prisma from '../../../../lib/db.js';

export async function GET(request, { params }) {
  const { id } = params;

  try {
    const card = await prisma.cardReference.findUnique({
      where: { apiId: id },
    });
    if (!card || card.game !== 'MTG') {
      return Response.json({ error: 'Card not found' }, { status: 404 });
    }
    return Response.json(card.apiPayload);
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
