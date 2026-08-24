import { BadRequestException } from '@nestjs/common';
import {
  buildPlayerDeduplicationKey,
  parseStrictDate,
} from './player-registration.rules';

describe('Player registration rules', () => {
  it('accepte une date ISO avec une année à quatre chiffres', () => {
    expect(parseStrictDate('2002-03-15', 'Date de naissance')).toEqual(
      new Date('2002-03-15T00:00:00.000Z'),
    );
  });

  it.each(['22222-03-15', '2002-02-31', '1899-12-31'])(
    'refuse la date invalide %s',
    (value) => {
      expect(() => parseStrictDate(value, 'Date de naissance')).toThrow(
        BadRequestException,
      );
    },
  );

  it('refuse une date de naissance future', () => {
    expect(() =>
      parseStrictDate('2100-01-01', 'Date de naissance', {
        forbidFuture: true,
      }),
    ).toThrow(BadRequestException);
  });

  it('produit la même clé malgré les accents, espaces et majuscules', () => {
    const base = {
      organizationId: '72d68e06-4e23-49ff-b752-9fbfaa7099a4',
      birthDate: '2002-03-15',
    };
    expect(
      buildPlayerDeduplicationKey({
        ...base,
        firstName: ' CÉDRIC ',
        lastName: 'DOSSOU',
      }),
    ).toBe(
      buildPlayerDeduplicationKey({
        ...base,
        firstName: 'cedric',
        lastName: 'dossou',
      }),
    );
  });
});
