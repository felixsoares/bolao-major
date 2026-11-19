# Bolão Singapura

Aplicação React/Vite para palpites do Major de CS2, com dados compartilhados pelo Supabase.

## Configuração do Supabase

1. No Supabase, abra o **SQL Editor**, cole e execute `supabase/schema.sql`.
2. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com os valores do projeto Supabase.
3. Execute `npm install` e `npm run dev`.
4. No primeiro acesso, os dados antigos deste navegador são migrados para o banco se ele ainda não tiver sido inicializado.
5. No Vercel, configure as mesmas variáveis em **Settings → Environment Variables** e faça um novo deploy.

O schema habilita leitura e escrita públicas para as tabelas `pool_state` e `picks`, conforme a configuração escolhida para este bolão. Qualquer pessoa poderá alterar os dados diretamente; a senha do painel é apenas uma barreira visual e não é salva no banco.

## Comandos

- `npm run dev`: inicia o servidor local.
- `npm run build`: gera os arquivos de produção na pasta `dist`.
- `npm run preview`: testa localmente o build de produção.
- `npm run lint`: executa o Oxlint.
