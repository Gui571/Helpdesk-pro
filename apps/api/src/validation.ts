import { Transform } from 'class-transformer';

export const Trim = () => Transform(({ value }) => typeof value === 'string' ? value.trim() : value);
export const NormalizeEmail = () => Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value);
