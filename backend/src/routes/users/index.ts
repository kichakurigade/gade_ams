/**
 * User directory — read-only list for team pickers.
 * User creation/management stays in the seed script / future admin module.
 */
import type { FastifyInstance } from 'fastify';

export default async function userRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // ─── GET /users ─────────────────────────────────────────────────────────
  fastify.get('/', async (_request, reply) => {
    const users = await fastify.prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, firstName: true, lastName: true, email: true, role: true },
      orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
    });

    return reply.send({ success: true, data: { users } });
  });
}
