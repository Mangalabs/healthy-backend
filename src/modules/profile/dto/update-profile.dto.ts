import { IsString, IsInt, Min, IsOptional, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;

  //TODO: 500ml? E se for uma mão colocando os dados de um bebe?
  // Se isso for impossível ou irrelevante, desconsidere
  @IsInt()
  @Min(500, { message: 'A meta de hidratação mínima é 500ml.' })
  @IsOptional()
  dailyHydrationGoal?: number;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  petName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  petStatus?: string;
}
