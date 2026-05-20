import { Customer, CustomerStatus, HealthPlan } from '../../services/types';

// ─── Gender inference by first name ──────────────────────────────────────────
export const inferGenderByName = (name: string): 'M' | 'F' | null => {
  if (!name) return null;
  const firstName = name.trim().split(' ')[0].toUpperCase();

  const female = ['MARIA','ANA','JULIANA','FERNANDA','PATRICIA','ALINE','CAMILA','LETICIA','AMANDA','BEATRIZ','CAROLINA','MARCELA','VANESSA','MARIANA','LUANA','THAIZ','THAIS','GABRIELA','JULIA','ISABELA','ISADORA','LAURA','LUIZA','VITORIA','CLARA','RAFAELA','SOFIA','HELENA','ALICE','MANUELA','VALENTINA','HELOISA','LORENA','GIOVANNA','CECILIA','NICOLE','SARAH','ISABEL','ESTHER','YASMIN','EDUARDA','ALICIA','LIVIA','MELISSA','MARINA','CLARICE','MILENA','SOPHIA'];
  const male   = ['JOSE','JOAO','ANTONIO','FRANCISCO','CARLOS','PAULO','PEDRO','LUCAS','LUIZ','MARCOS','LUIS','GABRIEL','RAFAEL','DANIEL','MARCELO','BRUNO','EDUARDO','FELIPE','RAIMUNDO','RODRIGO','MATEUS','MATHEUS','THIAGO','GUILHERME','ENZO','ARTHUR','MIGUEL','DAVI','BERNARDO','HEITOR','SAMUEL','LORENZO','BENJAMIN','NICOLAS','GUSTAVO','ISAAC','CAUAN','CAUA','VITOR','VICTOR','LEONARDO','ENRICO','THOMAS','TOMAS'];

  if (female.includes(firstName)) return 'F';
  if (male.includes(firstName))   return 'M';

  if (firstName.endsWith('A') || firstName.endsWith('IA') || firstName.endsWith('LY') || firstName.endsWith('NY') || firstName.endsWith('IE') || firstName.endsWith('NA')) {
    const maleExceptionsA = ['LUCAS','JOSIAS','THOMAS','NICOLLAS','MATTHIAS','OSIAS','ELIAS','JONAS','BARNABAS'];
    let isException = maleExceptionsA.some(e => firstName.includes(e));
    if (firstName === 'ANDREA' || firstName === 'NICOLA' || firstName === 'GIANLUCA') isException = true;
    return isException ? 'M' : 'F';
  }

  if (firstName.endsWith('O') || firstName.endsWith('SON') || firstName.endsWith('EL') || firstName.endsWith('OS') || firstName.endsWith('OR') || firstName.endsWith('US')) return 'M';
  return null;
};

// ─── Validation helpers ───────────────────────────────────────────────────────
export const isPhoneValid = (phone: string | undefined): boolean => {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11;
};

export const getIncompleteFields = (customer: Customer): string[] => {
  if (customer.status !== CustomerStatus.ACTIVE) return [];
  const missing: string[] = [];
  if (!customer.phone) missing.push('Telefone');
  else if (!isPhoneValid(customer.phone)) missing.push('Telefone Inválido');
  if (!customer.birthDate) missing.push('Data de Nasc.');
  if (!customer.gender)    missing.push('Gênero');
  if (customer.healthPlan === HealthPlan.PARTICULAR && !customer.customPrice) missing.push('Valor da Consulta');
  const plan = String(customer.healthPlan || '').toUpperCase();
  if ((plan.includes('AMS') || plan.includes('PETROBRAS')) && !customer.amsPasswordExpiry) missing.push('Vencimento Senha');
  return missing;
};

// ─── Display helpers ──────────────────────────────────────────────────────────
export const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '-';
  return dateStr.split('-').reverse().join('/');
};

export const calculateAge = (birthDate?: string): string | null => {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const md = today.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && today.getDate() < birth.getDate())) age--;
  return `${age} anos`;
};

export const calculateClinicTime = (firstDate?: string, createdAt?: string): string => {
  const start = firstDate ? new Date(firstDate) : createdAt ? new Date(createdAt) : new Date();
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (months < 0) { years--; months += 12; }
  if (years > 0) return `${years} ${years === 1 ? 'ano' : 'anos'}${months > 0 ? ` e ${months} ${months === 1 ? 'mês' : 'meses'}` : ''}`;
  return `${months} ${months === 1 ? 'mês' : 'meses'}`;
};
