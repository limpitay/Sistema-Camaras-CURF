// Flechas fijas a los costados de la pantalla para hojear el detalle de una
// fila sin cerrar el modal — se ocultan solas en el extremo de la lista.
export default function NavModal({ onAnterior, onSiguiente }) {
  return (
    <>
      {onAnterior && (
        <button
          type="button"
          className="btn btn-light rounded-circle shadow"
          aria-label="Anterior"
          style={{ position: 'fixed', left: 20, top: '50%', transform: 'translateY(-50%)', zIndex: 1060, width: 44, height: 44 }}
          onClick={onAnterior}
        >
          ‹
        </button>
      )}
      {onSiguiente && (
        <button
          type="button"
          className="btn btn-light rounded-circle shadow"
          aria-label="Siguiente"
          style={{ position: 'fixed', right: 20, top: '50%', transform: 'translateY(-50%)', zIndex: 1060, width: 44, height: 44 }}
          onClick={onSiguiente}
        >
          ›
        </button>
      )}
    </>
  );
}
