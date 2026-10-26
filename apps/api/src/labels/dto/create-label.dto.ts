import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CreateLabelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;

  /** #rrggbb — the UI renders it directly, so keep it a plain hex colour. */
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: "color must be a #rrggbb hex value" })
  color!: string;
}
