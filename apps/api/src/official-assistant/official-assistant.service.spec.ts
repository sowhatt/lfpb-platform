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

  it.each([
    ['Carton jaune numéro 5 Dragons à la quatre-vingtième minute', 80],
    ['Carton jaune numéro 5 Dragons à la quatre-vingt-dixième minute', 90],
    ['Carton jaune numéro 5 Dragons à la quatre-vingt-neuvième minute', 89],
    ['Carton rouge numéro 10 Aziza à la soixante-quinzième minute', 75],
    ['But numéro 8 Dragons à la soixante-dixième minute', 70],
  ])('interprète correctement la minute parlée: %s', (transcript, minute) => {
    expect(service.interpret(transcript)).toMatchObject({ minute });
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

describe('OfficialAssistantService - advanced match facts', () => {
  const service = new OfficialAssistantService({} as any);

  it('distingue une blessure d’un incident général', () => {
    const result = service.interpret(
      'Blessure numéro 8 à la trente-deuxième minute',
    );

    expect(result.type).toBe('INJURY');
    expect(result.playerNumber).toBe(8);
    expect(result.minute).toBe(32);
  });

  it('reconnaît une observation officielle', () => {
    const result = service.interpret(
      'Observation à signaler à la quatre-vingtième minute',
    );

    expect(result.type).toBe('OBSERVATION');
    expect(result.minute).toBe(80);
  });

  it('conserve les incidents généraux', () => {
    const result = service.interpret(
      'Incident en tribune à la soixantième minute',
    );

    expect(result.type).toBe('INCIDENT');
    expect(result.minute).toBe(60);
  });
});
