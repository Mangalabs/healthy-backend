import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SocialLoginDto {
  @IsEnum(['google', 'apple'], {
    message: 'O provedor deve ser google ou apple.',
  })
  @IsNotEmpty()
  provider: 'google' | 'apple';

  /** ID token (JWT) emitido pelo Google ou pela Apple; é verificado no servidor. */
  @IsString()
  @IsNotEmpty({ message: 'O token do provedor é obrigatório.' })
  idToken: string;

  /** A Apple só envia o nome no primeiro login, e fora do token. */
  @IsString()
  @IsOptional()
  name?: string;
}
