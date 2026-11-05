export default function SeletorConexao({ conexoes, valor, aoMudar, rotulo = 'Conexão' }) {
  return (
    <label className="campo">
      <span>{rotulo}</span>
      <select value={valor ?? ''} onChange={(e) => aoMudar(e.target.value)}>
        {!conexoes.length && <option value="">Nenhuma conexão</option>}
        {conexoes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>
    </label>
  );
}
