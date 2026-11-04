import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RefreshTokenDto {
  @IsString({ message: 'Refresh token inválido.' })
  @IsNotEmpty({ message: 'O refresh token é obrigatório.' })
  @MaxLength(200, { message: 'Refresh token inválido.' })
  refreshToken: string;
}
