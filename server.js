const http = require('http');
const fs   = require('fs');
const path = require('path');

const DB_FILE   = path.join(__dirname, 'biriteco.db.json');
const PORT      = process.env.PORT || 8080;

// ── Banco de dados: arquivo JSON simples ──────────────────────────────────
// Estrutura: { lancamentos: {}, custos: {}, config: {} }

function lerDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch(e) {
    console.error('Erro ao ler banco:', e.message);
  }
  return { lancamentos: {}, custos: {}, config: {} };
}

function salvarDB(dados) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(dados, null, 2), 'utf8');
  } catch(e) {
    console.error('Erro ao salvar banco:', e.message);
  }
}

// Garante que o arquivo existe na primeira vez
if (!fs.existsSync(DB_FILE)) {
  salvarDB({ lancamentos: {}, custos: {}, config: {} });
  console.log('Banco de dados criado:', DB_FILE);
} else {
  const d = lerDB();
  const nLanc = Object.keys(d.lancamentos || {}).length;
  const nCust = Object.keys(d.custos || {}).length;
  console.log('Banco carregado:', nLanc, 'lancamentos,', nCust, 'custos');
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function respJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

function lerBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch(e) { reject(new Error('JSON invalido: ' + e.message)); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
};

// ── Rotas da API ─────────────────────────────────────────────────────────────
const ROTAS = {

  // GET /api/lancamentos
  'GET /api/lancamentos': (req, res) => {
    respJSON(res, 200, lerDB().lancamentos || {});
  },

  // POST /api/lancamentos/:data
  'POST /api/lancamentos': async (req, res, params) => {
    const body = await lerBody(req);
    const db = lerDB();
    db.lancamentos[params.data] = body;
    salvarDB(db);
    respJSON(res, 200, { ok: true });
  },

  // DELETE /api/lancamentos/:data
  'DELETE /api/lancamentos': (req, res, params) => {
    const db = lerDB();
    delete db.lancamentos[params.data];
    salvarDB(db);
    respJSON(res, 200, { ok: true });
  },

  // DELETE /api/lancamentos (todos)
  'DELETE /api/lancamentos/': (req, res) => {
    const db = lerDB();
    db.lancamentos = {};
    salvarDB(db);
    respJSON(res, 200, { ok: true });
  },

  // GET /api/custos
  'GET /api/custos': (req, res) => {
    respJSON(res, 200, lerDB().custos || {});
  },

  // POST /api/custos
  'POST /api/custos': async (req, res) => {
    const body = await lerBody(req);
    const db = lerDB();
    db.custos[body.chave] = body.valor;
    salvarDB(db);
    respJSON(res, 200, { ok: true });
  },

  // DELETE /api/custos/:chave
  'DELETE /api/custos': (req, res, params) => {
    const db = lerDB();
    delete db.custos[params.chave];
    salvarDB(db);
    respJSON(res, 200, { ok: true });
  },

  // GET /api/config
  'GET /api/config': (req, res) => {
    respJSON(res, 200, lerDB().config || {});
  },

  // POST /api/config
  'POST /api/config': async (req, res) => {
    const body = await lerBody(req);
    const db = lerDB();
    db.config = body;
    salvarDB(db);
    respJSON(res, 200, { ok: true });
  },

  // GET /api/backup
  'GET /api/backup': (req, res) => {
    const backup = lerDB();
    backup.versao = '4';
    backup.exportadoEm = new Date().toLocaleString('pt-BR');
    const hoje = new Date();
    const nome = 'biriteco-backup-' +
      hoje.getFullYear() +
      String(hoje.getMonth()+1).padStart(2,'0') +
      String(hoje.getDate()).padStart(2,'0') + '.json';
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="' + nome + '"',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(backup, null, 2));
  },

  // POST /api/restaurar
  'POST /api/restaurar': async (req, res) => {
    const body = await lerBody(req);
    const { versao, exportadoEm, ...dados } = body;
    salvarDB({
      lancamentos: dados.lancamentos || {},
      custos:      dados.custos      || {},
      config:      dados.config      || {}
    });
    respJSON(res, 200, { ok: true, msg: 'Backup restaurado' });
  },
};

// ── Servidor principal ────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url      = req.url.split('?')[0];
  const method   = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  try {
    // ── Roteamento da API ──────────────────────────────────────────────────
    if (url.startsWith('/api/')) {
      const parts = url.split('/'); // ['', 'api', 'recurso', 'id?']
      const recurso = parts[2]; // 'lancamentos', 'custos', etc.
      const id      = parts[3] ? decodeURIComponent(parts[3]) : null;

      // Monta chave de rota: ex 'GET /api/lancamentos'
      const rotaBase = method + ' /api/' + recurso;

      if (id) {
        // Rota com parâmetro: POST /api/lancamentos/:data ou DELETE /api/custos/:chave
        const handler = ROTAS[rotaBase];
        if (handler) {
          const params = recurso === 'lancamentos' ? { data: id } : { chave: id };
          await handler(req, res, params);
          return;
        }
      } else {
        const handler = ROTAS[rotaBase];
        if (handler) {
          await handler(req, res, {});
          return;
        }
      }

      return respJSON(res, 404, { erro: 'Rota nao encontrada: ' + url });
    }

    // ── Arquivos estáticos ─────────────────────────────────────────────────
    let filePath = url === '/' ? '/biriteco_v4.html' : url;
    filePath = path.join(__dirname, filePath);

    // Segurança: impede acesso fora da pasta
    if (!filePath.startsWith(__dirname)) {
      res.writeHead(403); return res.end('Proibido');
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404); return res.end('Nao encontrado: ' + url);
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(fs.readFileSync(filePath));

  } catch(err) {
    console.error('Erro na requisicao:', err.message);
    respJSON(res, 500, { erro: err.message });
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('============================================');
  console.log('  BIRITECO - Servidor Rodando');
  console.log('============================================');
  console.log('  Acesse: http://localhost:' + PORT);
  console.log('  Dados:  biriteco.db.json');
  console.log('  Para parar: feche esta janela');
  console.log('============================================');
  console.log('');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.log('Porta ' + PORT + ' em uso, tentando liberar...');
    try {
      const { execSync } = require('child_process');
      // Tenta matar o processo na porta (Windows)
      const out = execSync(
        'netstat -ano | findstr :' + PORT,
        { encoding: 'utf8', timeout: 5000 }
      );
      const pids = new Set();
      out.split('\n').forEach(line => {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
      });
      pids.forEach(pid => {
        try { execSync('taskkill /F /PID ' + pid, { timeout: 5000 }); }
        catch(e) { /* ignora */ }
      });
      // Espera um pouco e tenta de novo
      setTimeout(() => {
        server.listen(PORT);
      }, 1000);
    } catch(e) {
      console.error('');
      console.error('ERRO: Porta ' + PORT + ' ja esta em uso.');
      console.error('Feche o outro servidor ou reinicie o computador.');
      console.error('');
      process.exit(1);
    }
  } else {
    console.error('Erro no servidor:', err.message);
    process.exit(1);
  }
});
