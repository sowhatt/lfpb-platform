# PWA vocale des officiels

## Périmètre du premier incrément

- application installable depuis le navigateur ;
- accès réservé au rôle `OFFICIEL` ;
- enregistrement par `MediaRecorder` ;
- transcription serveur compatible avec une API de transcription multipart ;
- secours par reconnaissance vocale du navigateur lorsqu’elle est disponible ;
- file audio hors ligne dans IndexedDB ;
- interprétation structurée : but, cartons, remplacement, incident, score final ou note ;
- confirmation humaine obligatoire avant toute utilisation métier.

La confirmation actuelle produit un brouillon local. La persistance dans une feuille de match sera ajoutée avec le module feuille de match, après validation de son circuit officiel.

## Configuration

```env
TRANSCRIPTION_API_URL=https://api.openai.com/v1/audio/transcriptions
TRANSCRIPTION_API_KEY=...
TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
```

L’API doit accepter un formulaire multipart contenant `file`, `model` et `language`, puis renvoyer un objet JSON `{ "text": "..." }`.

## Règles de sécurité

- aucune transcription n’est une décision sportive ;
- l’API de transcription est limitée au rôle `OFFICIEL` ;
- un audio est limité à 5 Mo ;
- seuls les formats audio WebM, Ogg, MP4, MPEG et WAV sont acceptés ;
- la clé du prestataire reste exclusivement côté serveur ;
- l’audio envoyé au serveur n’est pas enregistré par LFPB Platform ;
- l’audio hors ligne reste sur le terminal jusqu’à synchronisation ;
- l’officiel doit vérifier type, joueur et minute avant confirmation.

## Recette minimale

1. Installer la PWA depuis Android ou iPhone.
2. Se connecter avec un compte `OFFICIEL`.
3. Ouvrir **Assistant vocal**.
4. Dicter : « Carton jaune au numéro 8 à la 37e minute ».
5. Vérifier la transcription et le brouillon proposé.
6. Corriger le texte puis relancer l’analyse.
7. Confirmer le brouillon.
8. Couper le réseau, enregistrer une seconde dictée et vérifier la file locale.
9. Rétablir le réseau et synchroniser la file.
10. Vérifier qu’un autre rôle reçoit un refus HTTP 403 sur les endpoints vocaux.
