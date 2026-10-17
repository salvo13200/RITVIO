import type {FastifyRequest} from 'fastify';
import type {LibraryStore} from './library-store';
export type Principal={id:string;mode:'local'|'online'};
// An online adapter will verify the remote session and map its subject to this ID.
// Library endpoints never accept an owner ID supplied by the renderer.
export interface IdentityProvider {resolve(request:FastifyRequest):Promise<Principal>}
export class LocalIdentityProvider implements IdentityProvider {
  private principal:Principal;
  constructor(library:LibraryStore){const profile=library.ensureProfile('local');this.principal={id:profile.id,mode:'local'};}
  async resolve(_request:FastifyRequest){return this.principal;}
}
