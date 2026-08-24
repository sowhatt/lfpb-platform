import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseStrictDate(
  value: string,
  label: string,
  options: { forbidFuture?: boolean } = {},
): Date {
  const match = ISO_DATE.exec(value);
  if (!match) {
    throw new BadRequestException(
      `${label} doit être au format AAAA-MM-JJ avec une année à 4 chiffres`,
    );
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    year < 1900 ||
    year > 2100 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new BadRequestException(`${label} est invalide`);
  }

  if (options.forbidFuture) {
    const today = new Date();
    const todayUtc = Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
    );
    if (date.getTime() > todayUtc) {
      throw new BadRequestException(`${label} ne peut pas être dans le futur`);
    }
  }

  return date;
}

export function normalizeIdentityPart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function buildPlayerDeduplicationKey(input: {
  organizationId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
}): string {
  const identity = [
    input.organizationId,
    'PLAYER',
    normalizeIdentityPart(input.firstName),
    normalizeIdentityPart(input.lastName),
    input.birthDate,
  ].join('|');

  return createHash('sha256').update(identity).digest('hex');
}
