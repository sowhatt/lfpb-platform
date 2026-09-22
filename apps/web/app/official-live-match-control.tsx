'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { OfficialLiveTranscriber } from './official-live-transcriber';
import { clockFromEvents, displayMatchClock, officialClockMinute, periodLabel } from './official-match-clock';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
type SheetPlayer = { registrationId: string; clubId: string; shirtNumber: number; side: 'HOME' | 'AWAY'; role?: 'STARTER' | 'SUBSTITUTE' | string; registration: { person: { firstName: string; lastName: string } }; club: { organization: { name: string } } };
type MatchPlayer = { registrationId: string; fullName: string; firstName: string; lastName: string; photoDataUrl?: string | null; shirtNumber?: number | null; club: { organizationId: string; name: string } };
type MatchSheet = { id: string; status: 'DRAFT' | 'SUBMITTED' | 'LOCKED'; validatedAt?: string | null; players: SheetPlayer[] } | null;
type LiveEvent = { id: string; type: string; minute?: number | null; stoppageMinute?: number | null; period?: string | null; createdAt?: string; registrationId?: string | null; description?: string | null; scoreAfter?: { home: number; away: number } };
type LiveState = { match: { id: string; status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | string; homeScore: number; awayScore: number; homeClubId: string; awayClubId: string }; events: LiveEvent[] };
type VoiceDraft = { type: 'GOAL' | 'YELLOW_CARD' | 'RED_CARD' | 'SUBSTITUTION' | 'INCIDENT' | 'INJURY' | 'OBSERVATION' | 'FINAL_SCORE' | 'NOTE'; minute?: number; playerNumber?: number; replacementPlayerNumber?: number; transcript: string };
type ResolvedDraft = { type: 'GOAL' | 'YELLOW_CARD' | 'RED_CARD' | 'SUBSTITUTION' | 'INCIDENT' | 'INJURY' | 'OBSERVATION'; minute: number; transcript: string; teamName?: string; clubId?: string; player?: SheetPlayer; secondaryPlayer?: SheetPlayer };
async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> { const response = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) } }); const payload = await response.json().catch(() => ({})); if (!response.ok) { const raw = (payload as { message?: string | string[] }).message; throw new Error(Array.isArray(raw) ? raw.join(' · ') : raw ?? `Erreur ${response.status}`); } return payload as T; }
const eventLabels: Record<string, string> = { MATCH_START: 'Coup d’envoi', HALF_TIME: 'Mi-temps', SECOND_HALF_START: 'Reprise 2e mi-temps', GOAL: 'But', YELLOW_CARD: 'Carton jaune', RED_CARD: 'Carton rouge', SUBSTITUTION: 'Remplacement', INCIDENT: 'Incident', INJURY: 'Blessure', OBSERVATION: 'Observation officielle', MATCH_END: 'Fin du match' };
const sheetStatusLabels: Record<string, string> = { DRAFT: 'Brouillon', SUBMITTED: 'Soumise', LOCKED: 'Verrouillée' }; const matchStatusLabels: Record<string, string> = { DRAFT: 'Brouillon', SCHEDULED: 'Programmé', POSTPONED: 'Reporté', IN_PROGRESS: 'En cours', COMPLETED: 'Terminé', CANCELLED: 'Annulé' };
function normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); } function playerName(player: SheetPlayer) { return `${player.registration.person.firstName} ${player.registration.person.lastName}`; } function words(value: string) { return normalize(value).split(/[^a-z0-9]+/).filter(Boolean); } function singular(value: string) { return value.endsWith('s') && value.length > 4 ? value.slice(0, -1) : value; }
function teamAliases(name: string) { const ignored = new Set(['football','club','benin','de','du','des','fc','rc','sc','as','ac','cf']); const tokens=words(name).filter((token)=>token.length>=3&&!ignored.has(token)); const aliases=new Set<string>(); for(const token of tokens){aliases.add(token);aliases.add(singular(token));} if(tokens.length>=2)aliases.add(tokens.slice(0,2).join(' ')); return [...aliases].filter((alias)=>alias.length>=3); }
function editDistance(a:string,b:string){const left=singular(a),right=singular(b),row=Array.from({length:right.length+1},(_,i)=>i);for(let i=1;i<=left.length;i+=1){let previous=row[0];row[0]=i;for(let j=1;j<=right.length;j+=1){const saved=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,previous+(left[i-1]===right[j-1]?0:1));previous=saved;}}return row[right.length];}
function aliasScore(text:string,alias:string){const transcriptWords=words(text),aliasWords=words(alias);if(aliasWords.length===1&&transcriptWords.some((word)=>singular(word)===singular(aliasWords[0])))return 1;if(aliasWords.length>1&&normalize(text).includes(normalize(alias)))return 1;let best=0;for(const expected of aliasWords)for(const actual of transcriptWords){const maxLength=Math.max(expected.length,actual.length);if(maxLength)best=Math.max(best,1-editDistance(expected,actual)/maxLength);}return best;}
function cardVisual(type:string){if(type==='RED_CARD')return{background:'#fee2e2',foreground:'#b91c1c',card:'#ef4444'};if(type==='YELLOW_CARD')return{background:'#fef3c7',foreground:'#92400e',card:'#facc15'};return null;} function eventMinuteLabel(event:LiveEvent){return event.stoppageMinute?`${event.minute ?? 0}+${event.stoppageMinute}'`:`${event.minute ?? 0}'`;}

type OfficialMatchRole =
  | 'REFEREE'
  | 'ASSISTANT_REFEREE_1'
  | 'ASSISTANT_REFEREE_2'
  | 'FOURTH_OFFICIAL'
  | 'MATCH_COMMISSIONER'
  | 'DELEGATE';

const ROLE_EVENT_PERMISSIONS: Record<OfficialMatchRole, string[]> = {
  REFEREE: [
    'MATCH_START',
    'HALF_TIME',
    'SECOND_HALF_START',
    'GOAL',
    'YELLOW_CARD',
    'RED_CARD',
    'SUBSTITUTION',
    'INCIDENT',
    'INJURY',
    'OBSERVATION',
    'MATCH_END',
  ],
  ASSISTANT_REFEREE_1: ['INCIDENT', 'OBSERVATION'],
  ASSISTANT_REFEREE_2: ['INCIDENT', 'OBSERVATION'],
  FOURTH_OFFICIAL: ['SUBSTITUTION', 'INCIDENT', 'OBSERVATION'],
  MATCH_COMMISSIONER: ['INCIDENT', 'OBSERVATION'],
  DELEGATE: ['INCIDENT', 'OBSERVATION'],
};

const ROLE_LABELS: Record<OfficialMatchRole, string> = {
  REFEREE: 'Arbitre central',
  ASSISTANT_REFEREE_1: 'Arbitre assistant 1',
  ASSISTANT_REFEREE_2: 'Arbitre assistant 2',
  FOURTH_OFFICIAL: 'Quatrième officiel',
  MATCH_COMMISSIONER: 'Commissaire au match',
  DELEGATE: 'Délégué',
};

const ROLE_ASSISTANT_COPY: Record<
  OfficialMatchRole,
  {
    title: string;
    description: string;
    placeholder: string;
  }
> = {
  REFEREE: {
    title: 'Préparer un événement de match',
    description:
      'Buts, cartons, remplacements, blessures, incidents et observations peuvent être préparés par saisie ou par la voix.',
    placeholder: 'Ex. Carton jaune numéro 5 Dragons',
  },
  ASSISTANT_REFEREE_1: {
    title: 'Signaler un fait de terrain',
    description:
      'Enregistrez uniquement une observation ou un incident relevant de votre mission d’assistant.',
    placeholder: 'Ex. Observation : comportement dans ma zone à la 34e minute',
  },
  ASSISTANT_REFEREE_2: {
    title: 'Signaler un fait de terrain',
    description:
      'Enregistrez uniquement une observation ou un incident relevant de votre mission d’assistant.',
    placeholder: 'Ex. Incident près de la ligne de touche à la 58e minute',
  },
  FOURTH_OFFICIAL: {
    title: 'Remplacement, incident ou observation',
    description:
      'Gérez les changements et documentez les faits autour des bancs et de la zone technique.',
    placeholder: 'Ex. Remplacement : numéro 9 sort, numéro 18 entre pour Dragons',
  },
  MATCH_COMMISSIONER: {
    title: 'Observation organisationnelle',
    description:
      'Consignez un incident ou une observation concernant l’organisation de la rencontre.',
    placeholder: 'Ex. Incident : accès vestiaires retardé avant le coup d’envoi',
  },
  DELEGATE: {
    title: 'Observation de délégation',
    description:
      'Consignez les faits administratifs, protocolaires ou organisationnels relevant de votre mission.',
    placeholder: 'Ex. Observation : contrôle protocolaire effectué avant la rencontre',
  },
};

export function OfficialLiveMatchControl({
  token,
  matchId,
  assignmentRole,
}: {
  token: string;
  matchId: string;
  assignmentRole: OfficialMatchRole;
}){
 const [sheet,setSheet]=useState<MatchSheet>(null),[live,setLive]=useState<LiveState|null>(null),[matchPlayers,setMatchPlayers]=useState<MatchPlayer[]>([]); const [minute,setMinute]=useState(1),[manualMinute,setManualMinute]=useState(false),[now,setNow]=useState(()=>Date.now()),[command,setCommand]=useState(''),[draft,setDraft]=useState<ResolvedDraft|null>(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[dictating,setDictating]=useState(false); const draftRef=useRef<HTMLDivElement|null>(null);
 const canManageLifecycle=assignmentRole==='REFEREE';
 const canManageSheet=assignmentRole==='REFEREE';
 const allowedEventTypes=ROLE_EVENT_PERMISSIONS[assignmentRole]??[];
 const roleLabel=ROLE_LABELS[assignmentRole]??assignmentRole;
 const assistantCopy=ROLE_ASSISTANT_COPY[assignmentRole];

 const playersById=useMemo(()=>{const map=new Map<string,SheetPlayer>();sheet?.players.forEach((p)=>map.set(p.registrationId,p));return map;},[sheet]); const profilesById=useMemo(()=>new Map(matchPlayers.map((p)=>[p.registrationId,p])),[matchPlayers]); const clock=useMemo(()=>clockFromEvents(live?.events??[],now),[live?.events,now]); const clockDisplay=displayMatchClock(clock),autoClock=officialClockMinute(clock),autoMinute=autoClock.minute;
 async function refresh(){const [sheetData,liveData,playerData]=await Promise.all([request<MatchSheet>(`/matches/${matchId}/sheet`,token),request<LiveState>(`/matches/${matchId}/events`,token),request<{players:MatchPlayer[]}>(`/official-match-access/${matchId}/players`,token)]);setSheet(sheetData);setLive(liveData);setMatchPlayers(playerData.players??[]);} useEffect(()=>{void refresh().catch((reason)=>setError(reason instanceof Error?reason.message:'Chargement impossible'));},[matchId,token]); useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);},[]); useEffect(()=>{if(!manualMinute&&clock.running)setMinute(autoMinute);},[autoMinute,clock.running,manualMinute]); useEffect(()=>{if(draft)window.setTimeout(()=>draftRef.current?.scrollIntoView({behavior:'smooth',block:'center'}),50);},[draft]);
 async function action(label:string,fn:()=>Promise<unknown>){setBusy(label);setError('');setMessage('');try{await fn();await refresh();setManualMinute(false);setMessage(`${label} enregistré.`);}catch(reason){setError(reason instanceof Error?reason.message:`${label} impossible`);}finally{setBusy('');}} function post(path:string,body?:unknown){return request(path,token,{method:'POST',body:body===undefined?undefined:JSON.stringify(body)});} function postEvent(type:string,extra:Record<string,unknown>={}){const selectedMinute=manualMinute?minute:autoMinute;const eventMinute=type==='MATCH_START'?0:Math.max(0,Math.min(130,selectedMinute));const clockMetadata=manualMinute?{}:{period:autoClock.period,stoppageMinute:autoClock.stoppageMinute};return post(`/matches/${matchId}/events`,{type,minute:eventMinute,...clockMetadata,...extra});}
 const match=live?.match,homePlayers=sheet?.players.filter((p)=>p.side==='HOME')??[],awayPlayers=sheet?.players.filter((p)=>p.side==='AWAY')??[],homeName=homePlayers[0]?.club.organization.name??'Domicile',awayName=awayPlayers[0]?.club.organization.name??'Extérieur'; const matchContext=useMemo(()=>({HOME:{name:homeName,aliases:teamAliases(homeName),players:homePlayers},AWAY:{name:awayName,aliases:teamAliases(awayName),players:awayPlayers}}),[homeName,awayName,sheet]);
 function mentionedSide(transcript:string):'HOME'|'AWAY'|undefined{const text=normalize(transcript);if(/\b(domicile|locaux)\b/.test(text))return'HOME';if(/\b(exterieur|visiteur|visiteurs)\b/.test(text))return'AWAY';const hs=Math.max(...matchContext.HOME.aliases.map((a)=>aliasScore(text,a)),0),as=Math.max(...matchContext.AWAY.aliases.map((a)=>aliasScore(text,a)),0),threshold=.72;if(hs>=threshold&&hs-as>=.08)return'HOME';if(as>=threshold&&as-hs>=.08)return'AWAY';return undefined;} function resolvePlayer(number:number,side:'HOME'|'AWAY'|undefined){const candidates=(sheet?.players??[]).filter((p)=>p.shirtNumber===number&&(!side||p.side===side));if(candidates.length===1)return candidates[0];if(!candidates.length)throw new Error(`Aucun joueur n°${number} trouvé${side?' dans cette équipe':' sur la feuille de match'}.`);throw new Error(`Le n°${number} existe dans les deux équipes. Précisez « ${homeName} » ou « ${awayName} ».`);}
 async function analyzeText(text:string){const value=text.trim();if(!value)return;setBusy('Analyse');setError('');setMessage('Analyse de la commande…');setDraft(null);try{const interpreted=await post('/official-assistant/interpretations',{transcript:value}) as VoiceDraft;if(interpreted.type==='NOTE')throw new Error('Commande non reconnue. Dites par exemple « carton rouge numéro 8 Dragons » ou précisez une minute.');if(interpreted.type==='FINAL_SCORE')throw new Error('Pour terminer la rencontre, utilisez le bouton « Fin du match ».');if(!allowedEventTypes.includes(interpreted.type))throw new Error(`${roleLabel} : cet événement n’est pas autorisé pour votre rôle sur cette rencontre.`);const eventMinute=interpreted.minute??(manualMinute?minute:autoMinute);if(interpreted.minute!==undefined){setMinute(interpreted.minute);setManualMinute(true);}if(interpreted.type==='INCIDENT'||interpreted.type==='OBSERVATION'){setDraft({type:interpreted.type,minute:eventMinute,transcript:interpreted.transcript});setMessage(interpreted.minute===undefined?`Événement compris · minute automatique ${autoClock.label}'. Vérifiez puis confirmez.`:'Événement compris. Vérifiez puis confirmez.');return;}if(interpreted.type==='INJURY'&&interpreted.playerNumber===undefined)throw new Error('Le numéro du joueur blessé est nécessaire.');if(interpreted.playerNumber===undefined)throw new Error('Le numéro du joueur est nécessaire.');const player=resolvePlayer(interpreted.playerNumber,mentionedSide(value)),teamName=player.side==='HOME'?homeName:awayName,clubId=player.clubId;if(interpreted.type==='SUBSTITUTION'){if(interpreted.replacementPlayerNumber===undefined)throw new Error('Précisez le numéro du joueur entrant.');const secondaryPlayer=resolvePlayer(interpreted.replacementPlayerNumber,player.side);setDraft({type:'SUBSTITUTION',minute:eventMinute,transcript:interpreted.transcript,teamName,clubId,player,secondaryPlayer});setMessage('Événement compris à partir du contexte du match. Vérifiez puis confirmez.');return;}setDraft({type:interpreted.type,minute:eventMinute,transcript:interpreted.transcript,teamName,clubId,player});setMessage(interpreted.minute===undefined?`Événement compris · minute automatique ${autoClock.label}'. Vérifiez puis confirmez.`:'Événement compris à partir du contexte du match. Vérifiez puis confirmez.');}catch(reason){setMessage('');setError(reason instanceof Error?reason.message:'Analyse impossible');}finally{setBusy('');}}
 async function analyzeCommand(event:FormEvent<HTMLFormElement>){event.preventDefault();if(dictating){setError('La dictée est encore active. Attendez l’arrêt automatique après votre phrase, ou touchez « Terminer maintenant ».');return;}await analyzeText(command);} async function confirmDraft(){if(!draft)return;const payload:Record<string,unknown>={minute:draft.minute};if(draft.type==='INCIDENT'||draft.type==='INJURY'||draft.type==='OBSERVATION')payload.description=draft.transcript;if(draft.player&&draft.clubId){payload.clubId=draft.clubId;payload.registrationId=draft.player.registrationId;}if(draft.secondaryPlayer)payload.secondaryRegistrationId=draft.secondaryPlayer.registrationId;await action(eventLabels[draft.type]??draft.type,()=>postEvent(draft.type,payload));setDraft(null);setCommand('');} const liveReady=sheet?.status==='LOCKED'&&match?.status==='IN_PROGRESS';
 return <section className="data-panel" style={{marginBottom:20}}><div className="workspace-actions"><div><label>MATCH CONNECTÉ · EN DIRECT</label><h2>{homeName} {match?`${match.homeScore} – ${match.awayScore}`:'–'} {awayName}</h2><p>Feuille : <strong>{sheet?.status?sheetStatusLabels[sheet.status]??sheet.status:'—'}</strong> · Match : <strong>{match?.status?matchStatusLabels[match.status]??match.status:'—'}</strong></p></div><button type="button" onClick={()=>void refresh()} disabled={Boolean(busy)}>Actualiser</button></div>{error&&<div className="api-error">{error}</div>}{message&&<div className="draft-warning">{message}</div>}
 {match?.status==='IN_PROGRESS'&&<div style={{marginTop:12,padding:14,border:'1px solid #dbe3ea',borderRadius:12,display:'flex',justifyContent:'space-between',gap:14,alignItems:'center',flexWrap:'wrap'}}><div><label>CHRONO OFFICIEL · {periodLabel(clock.period).toUpperCase()}</label><div style={{fontSize:30,fontWeight:900,marginTop:4}}>{clock.legacyClock?'Chrono historique non repris':clockDisplay.timeLabel}</div><small>{clock.legacyClock?'Ancien match de test : utilisez une nouvelle rencontre pour démarrer un chrono fiable.':manualMinute?`Correction manuelle active : ${minute}'`:`Minute événement automatique : ${autoClock.label}'`}</small></div>{manualMinute&&<button type="button" onClick={()=>{setManualMinute(false);setMinute(autoMinute);}}>↻ Reprendre le chrono</button>}</div>}
 <div className="workspace-actions" style={{marginTop:12,alignItems:'center'}}>{canManageSheet&&sheet?.status==='SUBMITTED'&&!sheet.validatedAt&&<button type="button" disabled={Boolean(busy)} onClick={()=>void action('Validation de la feuille',()=>post(`/matches/${matchId}/sheet/validate`))}>Valider la feuille</button>}{canManageSheet&&sheet?.status==='SUBMITTED'&&sheet.validatedAt&&<button type="button" disabled={Boolean(busy)} onClick={()=>void action('Verrouillage de la feuille',()=>post(`/matches/${matchId}/sheet/lock`))}>🔒 Verrouiller la feuille</button>}{canManageLifecycle&&sheet?.status==='LOCKED'&&match?.status==='SCHEDULED'&&<button type="button" disabled={Boolean(busy)} onClick={()=>void action('Coup d’envoi',()=>postEvent('MATCH_START'))}>▶ Coup d’envoi</button>}{canManageLifecycle&&sheet?.status==='LOCKED'&&match?.status==='IN_PROGRESS'&&<><label style={{display:'flex',alignItems:'center',gap:8}}>Minute événement<input style={{width:78}} type="number" min={0} max={130} value={manualMinute?minute:autoMinute} onChange={(event)=>{setMinute(Number(event.target.value));setManualMinute(true);}} /></label><button type="button" disabled={Boolean(busy)||clock.period==='HALF_TIME'||clock.legacyClock} onClick={()=>void action('Mi-temps',()=>postEvent('HALF_TIME'))}>Mi-temps</button><button type="button" disabled={Boolean(busy)||clock.period!=='HALF_TIME'||clock.legacyClock} onClick={()=>void action('Reprise',()=>postEvent('SECOND_HALF_START'))}>Reprise</button><button type="button" disabled={Boolean(busy)||clock.legacyClock} onClick={()=>void action('Fin du match',()=>postEvent('MATCH_END'))}>■ Fin du match</button></>}</div>
 <div style={{marginTop:20}}><h3>Compositions de la feuille de match</h3><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:14}}>{[{title:homeName,players:homePlayers},{title:awayName,players:awayPlayers}].map((team)=><div key={team.title} className="draft-warning" style={{margin:0}}><strong>{team.title} · {team.players.length} joueur(s)</strong>{team.players.map((player)=><div key={player.registrationId} style={{marginTop:8}}><b>#{player.shirtNumber}</b> · {playerName(player)}{player.role?` · ${player.role==='STARTER'?'Titulaire':player.role==='SUBSTITUTE'?'Remplaçant':player.role}`:''}</div>)}</div>)}</div></div>
 <div className="workspace-actions" style={{marginTop:20,display:'block'}}><label>ASSISTANT DIGITAL · {roleLabel.toUpperCase()}</label><h3>{assistantCopy.title}</h3><p>{assistantCopy.description}</p><form onSubmit={analyzeCommand} style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:12}}><input value={command} onChange={(event)=>{setCommand(event.target.value);setError('');setMessage('');setDraft(null);}} placeholder={assistantCopy.placeholder} style={{flex:'1 1 420px'}}/><OfficialLiveTranscriber token={token} disabled={Boolean(busy)||clock.legacyClock} onListeningChange={setDictating} onDelta={(text)=>{setError('');setMessage('');setDraft(null);setCommand(text);}} onFinal={async(text)=>{setCommand(text);await analyzeText(text);}} onError={(liveError)=>setError(liveError)}/><button type="submit" disabled={Boolean(busy)||dictating||!command.trim()||clock.legacyClock}>{dictating?'Dictée en cours…':busy==='Analyse'?'Analyse…':'Analyser'}</button></form>{draft&&<div ref={draftRef} className="draft-warning" style={{marginTop:14,border:'2px solid #eab308'}}><strong>À CONFIRMER · {eventLabels[draft.type]}</strong><div style={{marginTop:6}}>{draft.teamName&&<span>{draft.teamName} · </span>}{draft.player&&<span>N°{draft.player.shirtNumber} · {playerName(draft.player)} · </span>}{draft.secondaryPlayer&&<span>entrant N°{draft.secondaryPlayer.shirtNumber} · {playerName(draft.secondaryPlayer)} · </span>}<span>{draft.minute}e minute</span></div>{!liveReady&&<p style={{marginTop:8}}>La confirmation sera disponible après validation, verrouillage de la feuille et coup d’envoi.</p>}<div style={{marginTop:10,display:'flex',gap:8}}><button type="button" disabled={!liveReady||Boolean(busy)||clock.legacyClock} onClick={()=>void confirmDraft()}>✓ Confirmer et enregistrer</button><button type="button" disabled={Boolean(busy)} onClick={()=>setDraft(null)}>Annuler</button></div></div>}</div>
 <div style={{marginTop:18}}><h3>Événements en direct</h3>{live?.events.length?<div style={{display:'grid',gap:10}}>{[...live.events].reverse().map((event)=>{const player=event.registrationId?playersById.get(event.registrationId):undefined,profile=event.registrationId?profilesById.get(event.registrationId):undefined,card=cardVisual(event.type),initials=profile?`${profile.firstName?.[0]??''}${profile.lastName?.[0]??''}`:player?`${player.registration.person.firstName[0]}${player.registration.person.lastName[0]}`:'';return <div key={event.id} style={{display:'flex',alignItems:'center',gap:12,padding:12,border:card?`1px solid ${card.card}`:'1px solid #dbe3ea',borderRadius:12,background:card?.background??'#fff'}}><strong style={{minWidth:42,fontSize:18}}>{eventMinuteLabel(event)}</strong>{card&&<span style={{width:18,height:28,borderRadius:3,background:card.card,display:'inline-block'}}/>}{profile?.photoDataUrl?<img src={profile.photoDataUrl} alt={profile.fullName} style={{width:54,height:54,borderRadius:10,objectFit:'cover'}}/>:player?<div style={{width:54,height:54,borderRadius:10,display:'grid',placeItems:'center',background:'#e8edf2',fontWeight:800}}>{initials}</div>:null}<div style={{flex:1}}><strong style={{display:'block',color:card?.foreground}}>{eventLabels[event.type]??event.type}</strong>{player&&<span>{playerName(player)} · N°{player.shirtNumber} · {player.club.organization.name}</span>}{event.description&&<span style={{display:'block',marginTop:4}}>{event.description}</span>}</div>{event.scoreAfter&&<strong>{event.scoreAfter.home} - {event.scoreAfter.away}</strong>}</div>;})}</div>:<p>Aucun événement enregistré.</p>}</div></section>;
}
