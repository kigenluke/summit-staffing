const CODES = {
  'Daily Living': '01_104_0136_1_1',
  'Community Access': '04_490_0117_6_1',
  'Assistance with Self-Care': '01_011_0107_1_1',
  'Assistance with Daily Life Tasks': '01_015_0107_1_1'
};

const normalize = (value) => {
  return String(value || '').trim().toLowerCase();
};

const getNDISItemCode = (serviceType) => {
  const input = normalize(serviceType);

  for (const [label, code] of Object.entries(CODES)) {
    if (normalize(label) === input) return code;
  }

  // best-effort matching
  if (input.includes('community')) return CODES['Community Access'];
  if (input.includes('self-care') || input.includes('self care')) return CODES['Assistance with Self-Care'];
  if (input.includes('daily') && input.includes('task')) return CODES['Assistance with Daily Life Tasks'];
  if (input.includes('daily')) return CODES['Daily Living'];

  return CODES['Daily Living'];
};

module.exports = {
  getNDISItemCode
};
