import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import fs from "fs";
import path from "path";

// Tenta carregar variáveis de múltiplos arquivos .env
const envFiles = [".env", ".env.local"];
const envVars: any = {};

envFiles.forEach(file => {
  const filePath = path.join(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, "utf-8");
    content.split("\n").forEach(line => {
      const [key, ...value] = line.split("=");
      if (key && value) {
        envVars[key.trim()] = value.join("=").trim().replace(/^["']|["']$/g, "");
      }
    });
  }
});

const SUPABASE_URL = envVars.VITE_SUPABASE_URL || envVars.SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = envVars.VITE_SUPABASE_SERVICE_ROLE_KEY || envVars.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("URL ou Service Role Key do Supabase não encontrados.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error: selectError } = await supabase.from("settings").select("id").limit(1).single();
  
  if (selectError) {
    console.error("Erro ao buscar configurações:", selectError);
    return;
  }

  const { error } = await supabase
    .from("settings")
    .update({ 
      zapi_url: "https://api.z-api.io/instances/3F01E967BBA5D115842BE629027F956B/token/2C1EB827884AFE8E23FD10B3",
      zapi_token: "Fa6e5dd1c21dc45e192924e92162c0f4eS"
    })
    .eq("id", data.id);

  if (error) {
    console.error("Erro ao atualizar configurações da Z-API:", error);
  } else {
    console.log("Configurações da Z-API atualizadas com sucesso!");
  }
}

run();
