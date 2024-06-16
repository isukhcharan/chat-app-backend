import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { IsOptional } from "class-validator";
import mongoose, { HydratedDocument } from "mongoose";

export type UserDocument = HydratedDocument<User>;

@Schema({
    autoIndex: true
})
export class User {
    @Prop({
        required: true,
        type: String,
        unique: true
    })
    username: string;

    @Prop({
        type: String,
        default: ''
    })
    first_name: string;

    @Prop({
        type: String,
        default: ''
    })
    last_name: string;

    @Prop({
        required: true,
        type: String,
        unique: true
    })
    email: string;

    @Prop({
        required: true,
        type: String
    })
    password: string;

    @Prop({
        type: Boolean,
        default: false
    })
    is_connected: boolean;

    @IsOptional()
    @Prop({
        type: mongoose.Schema.Types.ObjectId,
        ref: User.name
    })
    connected_to: string;

    @Prop({
        type: Array<String>,
        default: []
    })
    interests: Array<String>;

    @Prop({
        default: false,
        type: Boolean
    })
    is_active: boolean;

    @Prop({
        default: true,
        type: Boolean
    })
    is_deleted: boolean;
}


export const UserSchema = SchemaFactory.createForClass(User)