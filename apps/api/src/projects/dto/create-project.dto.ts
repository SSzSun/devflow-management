import { IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  /** Issue-key prefix, e.g. "DEV" → DEV-101. */
  @IsString()
  @Matches(/^[A-Z][A-Z0-9]{1,9}$/, { message: "key must be 2-10 chars: A-Z and digits, starting with a letter" })
  key!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
