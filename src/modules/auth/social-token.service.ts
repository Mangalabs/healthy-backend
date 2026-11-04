import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface VerifiedIdentity {
  email: string;
  name?: string;
}

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const APPLE_ISSUER = 'https://appleid.apple.com';

const googleKeys = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
);
const appleKeys = createRemoteJWKSet(
  new URL('https://appleid.apple.com/auth/keys'),
);

function audiences(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Valida o ID token do provedor (assinatura, emissor, audiência e validade).
 * Sem client IDs configurados o login social fica desligado, nunca aberto.
 */
@Injectable()
export class SocialTokenService {
  async verify(
    provider: 'google' | 'apple',
    idToken: string,
  ): Promise<VerifiedIdentity> {
    const isGoogle = provider === 'google';
    const audience = audiences(
      isGoogle ? process.env.GOOGLE_CLIENT_IDS : process.env.APPLE_CLIENT_IDS,
    );

    if (audience.length === 0) {
      throw new UnauthorizedException(
        'Login social não está configurado neste servidor.',
      );
    }

    try {
      const { payload } = await jwtVerify(
        idToken,
        isGoogle ? googleKeys : appleKeys,
        { issuer: isGoogle ? GOOGLE_ISSUERS : APPLE_ISSUER, audience },
      );

      const verified =
        payload.email_verified === true || payload.email_verified === 'true';

      if (typeof payload.email !== 'string' || !verified) {
        throw new Error('E-mail ausente ou não verificado');
      }

      return {
        email: payload.email.toLowerCase(),
        name: typeof payload.name === 'string' ? payload.name : undefined,
      };
    } catch {
      throw new UnauthorizedException('Token do provedor inválido.');
    }
  }
}
