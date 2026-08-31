import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OfficialAssistantService } from './official-assistant.service';

describe('OfficialAssistantService', () => {
  const service = new OfficialAssistantService(new ConfigService());

  it('prépare un carton jaune sans prendre la décision à la place de l’officiel', () => {
    expect(service.interpret('Carton jaune au numéro 8 à la 37e minute')).toEqual({
      type: 'YELLOW_CARD',
      minute: 37,
      playerNumber: 8,
      transcript: 'Carton jaune au numéro 8 à la 37e minute',
      confidence: 0.95,
      needsConfirmation: true,
    });
  });

  it('identifie les deux joueurs d’un remplacement', () => {
    expect(service.interpret('Le numéro 18 remplace le numéro 7 à la 62e minute')).toMatchObject({
      type: 'SUBSTITUTION',
      minute: 62,
      playerNumber: 18,
      replacementPlayerNumber: 7,
      needsConfirmation: true,
    });
  });

  it('refuse une minute manifestement invalide', () => {
    expect(() => service.interpret('But du numéro 9 à la 999e minute')).toThrow(BadRequestException);
  });
});
