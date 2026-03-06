export default function Home() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: 'linear-gradient(135deg, #0a0a2e, #1a1a4e)',
      color: '#fff',
    }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '1rem', color: '#00c8ff' }}>
        🖥️ Era Computer
      </h1>
      <p style={{ fontSize: '1.2rem', color: '#aaa', marginBottom: '2rem' }}>
        Système d'ordinateur synchronisé pour Garry's Mod
      </p>
      <div style={{
        background: 'rgba(255,255,255,0.05)',
        borderRadius: '12px',
        padding: '2rem',
        maxWidth: '500px',
        textAlign: 'center',
      }}>
        <p style={{ marginBottom: '1rem' }}>
          Cette page est l'interface de l'ordinateur in-game.
        </p>
        <p style={{ color: '#888', fontSize: '0.9rem' }}>
          Spawn un "Era Computer" dans Garry's Mod pour commencer.
        </p>
      </div>
    </div>
  );
}
