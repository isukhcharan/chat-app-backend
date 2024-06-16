import { IsEmail, IsOptional, IsString } from "class-validator";

export class CreateUserDto {
    @IsString()
    @IsOptional()
    first_name: string;

    @IsOptional()
    @IsString()
    last_name: string;

    @IsEmail()
    email: string;

    @IsString()
    password: string;

    @IsString()
    username:string;

}