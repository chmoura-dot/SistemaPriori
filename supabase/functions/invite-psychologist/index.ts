import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { email } = await req.json();

    if (!email) {
      throw new Error('E-mail é obrigatório para enviar o convite.');
    }

    // Validação básica de formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Formato de e-mail inválido.');
    }

    const { data, error } = await supabaseClient.auth.admin.inviteUserByEmail(email, {
      data: {
        role: 'psychologist'
      }
    });

    if (error) {
      // Se o usuário já existe, não conseguimos convidá-lo novamente.
      // Em vez disso, enviamos um e-mail de redefinição de senha para que ele possa acessar.
      if (error.message.toLowerCase().includes('already registered')) {
        const { error: resetError } = await supabaseClient.auth.resetPasswordForEmail(email);
        
        if (resetError) {
          throw new Error(`Usuário já registrado, mas falhou ao enviar link de redefinição: ${resetError.message}`);
        }
        
        return new Response(
          JSON.stringify({ success: true, message: 'Usuário já existia. E-mail de redefinição de senha enviado.' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        );
      }
      throw error;
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Convite enviado com sucesso.', user: data?.user }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    // Retornamos 200 com success: false para que o frontend consiga ler o JSON com a mensagem de erro
    // Em vez de retornar 400 ou 500, o que geraria um erro opaco no supabase.functions.invoke
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  }
});