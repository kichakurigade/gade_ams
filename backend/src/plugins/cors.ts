import fp from 'fastify-plugin';
import fastifyCors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

async function corsPlugin(fastify: FastifyInstance) {
  await fastify.register(fastifyCors, {
    // Single-firm tool — only allow requests from our own frontend origin
    origin:
      config.NODE_ENV === 'production'
        ? 'https://ams.gadeassociates.co.ke'
        : ['http://localhost:3000', 'http://frontend:3000'],
    credentials: true, // Required for httpOnly cookies
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
}

export default fp(corsPlugin, { name: 'cors' });
