export interface MetaScreeningResult {
  passed: boolean;
  normalizedRole: string;
  questionnaire: Record<string, any>;
}

/**
 * Helper to find field value by partial key match across Meta Form export headers
 */
function getFieldValue(fields: Record<string, any>, ...substrings: string[]): string {
  if (!fields) return '';
  const keys = Object.keys(fields);
  for (const sub of substrings) {
    const subClean = sub.toLowerCase().replace(/[^a-z0-9]/g, '');
    const matchedKey = keys.find((k) => k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(subClean));
    if (matchedKey && fields[matchedKey] !== undefined && fields[matchedKey] !== null) {
      const val = fields[matchedKey];
      if (typeof val === 'object' && val.v) return String(val.v).trim();
      return String(val).trim();
    }
  }
  return '';
}

/**
 * Lead ingestion logic - processes every lead and passes them directly for email invite
 */
export function evaluateMetaScreening(role: string, fields: Record<string, any>): MetaScreeningResult {
  const normalizedRoleInput = String(role || '').toLowerCase();
  const isGM = normalizedRoleInput.includes('general manager') || normalizedRoleInput.includes('gm');

  if (isGM) {
    const val5Years = getFieldValue(fields, 'at_least_5_years', '5_years', 'five_plus', 'managerial_experience');
    const has5Years = val5Years.toLowerCase() === 'yes' || val5Years.toLowerCase() === 'y' || val5Years.toLowerCase() === 'true';

    const valMulti = getFieldValue(fields, 'managed_multiple_outlets', 'multi_outlet');
    const multiOutlet = valMulti.toLowerCase() === 'yes' || valMulti.toLowerCase() === 'y' || valMulti.toLowerCase() === 'true';

    const outletScale = getFieldValue(fields, 'which_best_describes', 'outlet_scale') || 'none';
    const valKochi = getFieldValue(fields, 'residing_in_kochi', 'city', 'location');
    const residingKochi = valKochi.toLowerCase().includes('kochi') || valKochi.toLowerCase() === 'yes' || valKochi.toLowerCase() === 'true';

    return {
      passed: true, // Direct processing for all leads
      normalizedRole: 'General Manager',
      questionnaire: {
        five_plus_years_exp: has5Years,
        multi_outlet_managed: multiOutlet,
        outlet_scale: outletScale,
        responsibilities: getFieldValue(fields, 'responsibilities'),
        residing_in_kochi: residingKochi,
        home_state: getFieldValue(fields, 'home_state', 'state', 'please_select') || 'Kerala',
      },
    };
  } else {
    // Cafe Staff / Barista
    const valQSR = getFieldValue(fields, 'prior_experience_in_fast_food', 'qsr_experience', 'fast_food');
    const hasQSR = valQSR.toLowerCase() === 'yes' || valQSR.toLowerCase() === 'y' || valQSR.toLowerCase() === 'true';

    const expYears = getFieldValue(fields, 'experience_in_fast_food', 'experience_duration') || '0';

    const valBev = getFieldValue(fields, 'comfortable_managing_both', 'bubble_tea', 'beverage');
    const beverageHandling = valBev.toLowerCase() === 'yes' || valBev.toLowerCase() === 'y' || valBev.toLowerCase() === 'true';

    const valBrand = getFieldValue(fields, 'worked_at_any_cafe', 'worked_at_any_cafes', 'qsr_brands', 'brand_experience');
    const brandExp = valBrand.toLowerCase() === 'yes' || valBrand.toLowerCase() === 'y' || valBrand.toLowerCase() === 'true';

    return {
      passed: true, // Direct processing for all leads
      normalizedRole: 'Cafe Staff / Barista',
      questionnaire: {
        qsr_experience: hasQSR,
        experience_duration: expYears,
        bubble_tea_and_coffee_ready: beverageHandling,
        top_brand_experience: brandExp,
        home_state: getFieldValue(fields, 'home_state', 'state', 'please_select') || 'Kerala',
      },
    };
  }
}
