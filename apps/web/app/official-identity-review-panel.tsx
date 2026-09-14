'use client';

export type IdentityReviewDecision = 'MATCH' | 'DOUBT' | 'NO_MATCH';

export function OfficialIdentityReviewPanel({
  licensePhoto,
  terrainPhoto,
  decision,
  onDecision,
}: {
  licensePhoto?: string | null;
  terrainPhoto?: string | null;
  decision: IdentityReviewDecision | '';
  onDecision: (decision: IdentityReviewDecision) => void;
}) {
  if (process.env.NEXT_PUBLIC_IDENTITY_REVIEW_ENABLED !== 'true') return null;

  const itemStyle = {
    border: '1px solid #dce3e7',
    borderRadius: 12,
    padding: 10,
    background: '#fff',
  } as const;

  return (
    <section style={{ marginTop: 16, padding: 14, borderRadius: 12, background: '#f7f9fa' }}>
      <div style={{ marginBottom: 10 }}>
        <strong style={{ display: 'block', color: '#203147' }}>Contrôle d’identité assisté</strong>
        <small style={{ color: '#657487' }}>
          Comparaison visuelle par l’officiel. Le moteur biométrique automatique n’est pas activé dans cette version.
        </small>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12 }}>
        <div style={itemStyle}>
          <small style={{ display: 'block', marginBottom: 7, fontWeight: 900, color: '#596879' }}>PHOTO LICENCE</small>
          {licensePhoto ? (
            <img src={licensePhoto} alt="Photo de licence" style={{ width: '100%', height: 220, objectFit: 'cover', borderRadius: 9 }} />
          ) : (
            <div style={{ height: 220, display: 'grid', placeItems: 'center', color: '#8b98a6' }}>Photo indisponible</div>
          )}
        </div>
        <div style={itemStyle}>
          <small style={{ display: 'block', marginBottom: 7, fontWeight: 900, color: '#596879' }}>PHOTO TERRAIN</small>
          {terrainPhoto ? (
            <img src={terrainPhoto} alt="Photo terrain" style={{ width: '100%', height: 220, objectFit: 'cover', borderRadius: 9 }} />
          ) : (
            <div style={{ height: 220, display: 'grid', placeItems: 'center', color: '#8b98a6' }}>Prenez une photo terrain</div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
        {([
          ['MATCH', '✓ Correspond'],
          ['DOUBT', '? Doute'],
          ['NO_MATCH', '⚠ Ne correspond pas'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onDecision(value)}
            style={{
              padding: '11px 8px',
              borderRadius: 9,
              border: decision === value ? '2px solid #0b2c48' : '1px solid #cfd8df',
              background: decision === value ? '#e9f0f5' : '#fff',
              color: value === 'NO_MATCH' ? '#9e3933' : '#203147',
              fontWeight: 900,
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
