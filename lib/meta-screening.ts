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

export function evaluateMetaScreening(role: string, fields: Record<string, any> = {}): MetaScreeningResult {
  const explicitRole = String(role || '').toLowerCase();
  const formHints = [
    getFieldValue(fields, 'form_name', 'form_title', 'form', 'ad_name', 'adset_name', 'campaign_name'),
    getFieldValue(fields, 'job_title', 'position', 'role', 'what_position_are_you_applying_for', 'applying_for'),
  ].filter(Boolean).join(' ').toLowerCase();

  const fieldKeys = Object.keys(fields || {}).join(' ').toLowerCase();

  // Check for HR Executive
  const isHR =
    explicitRole.includes('hr') ||
    explicitRole.includes('human resource') ||
    explicitRole.includes('personnel') ||
    explicitRole.includes('recruiter') ||
    formHints.includes('hr') ||
    formHints.includes('human resource') ||
    formHints.includes('personnel') ||
    formHints.includes('recruitment') ||
    fieldKeys.includes('hr_experience') ||
    fieldKeys.includes('recruitment_experience') ||
    fieldKeys.includes('statutory_compliance') ||
    fieldKeys.includes('multi_branch') ||
    fieldKeys.includes('two_wheeler');

  // Check for General Manager / Cafe Manager / Store Manager
  const isGM =
    !isHR &&
    (explicitRole.includes('general manager') ||
      explicitRole.includes('gm') ||
      explicitRole.includes('store manager') ||
      explicitRole.includes('cafe manager') ||
      explicitRole.includes('restaurant manager') ||
      explicitRole.includes('branch manager') ||
      explicitRole.includes('manager') ||
      formHints.includes('general manager') ||
      formHints.includes('store manager') ||
      formHints.includes('cafe manager') ||
      formHints.includes('restaurant manager') ||
      formHints.includes('branch manager') ||
      formHints.includes('manager') ||
      fieldKeys.includes('managerial_experience') ||
      fieldKeys.includes('multi_outlet') ||
      fieldKeys.includes('managed_multiple_outlets') ||
      fieldKeys.includes('at_least_5_years'));

  const isBaristaOnly =
    !isHR &&
    !isGM &&
    ((explicitRole.includes('barista') && !explicitRole.includes('cafe staff')) ||
      (formHints.includes('barista') && !formHints.includes('cafe staff')));

  const isCafeStaffOnly =
    !isHR &&
    !isGM &&
    ((explicitRole.includes('cafe staff') && !explicitRole.includes('barista')) ||
      (formHints.includes('cafe staff') && !formHints.includes('barista')));

  if (isHR) {
    const valExpYears = getFieldValue(
      fields,
      'how_many_years_of_hr_experience',
      'how_many_years',
      'years_of_experience',
      'hr_experience',
      'experience_in_hr',
      'total_hr_experience',
      'experience_duration'
    ) || '2-5 years';

    const valMulti = getFieldValue(
      fields,
      'have_you_managed_hr_across_multiple_branches',
      'managed_hr_across_multiple_branches',
      'multi_branch',
      'multi_location',
      'multiple_branches',
      'managed_multiple_outlets',
      'multi_outlet'
    );
    const multiBranch =
      valMulti.toLowerCase() === 'yes' ||
      valMulti.toLowerCase() === 'y' ||
      valMulti.toLowerCase() === 'true';

    const valRecruitment = getFieldValue(
      fields,
      'have_you_handled_recruitment',
      'handled_recruitment',
      'recruitment_experience',
      'hiring_experience',
      'sourcing_and_hiring',
      'recruitment'
    );
    const hasRecruitment =
      valRecruitment.toLowerCase() === 'yes' ||
      valRecruitment.toLowerCase() === 'y' ||
      valRecruitment.toLowerCase() === 'true' ||
      valRecruitment.length > 0;

    const valCompliance = getFieldValue(
      fields,
      'have_you_handled_statutory_compliance',
      'statutory_compliance',
      'handled_statutory_compliance',
      'compliance_experience',
      'compliance'
    );
    const hasCompliance =
      valCompliance.toLowerCase() === 'yes' ||
      valCompliance.toLowerCase() === 'y' ||
      valCompliance.toLowerCase() === 'true';

    const valMalayalam = getFieldValue(
      fields,
      'malayalam_proficiency',
      'malayalam_speaking',
      'languages_spoken',
      'malayalam'
    );
    const speaksMalayalam =
      valMalayalam.toLowerCase() === 'yes' ||
      valMalayalam.toLowerCase() === 'y' ||
      valMalayalam.toLowerCase() === 'true' ||
      valMalayalam.toLowerCase().includes('malayalam');

    const valMobility = getFieldValue(
      fields,
      'are_you_comfortable_travelling',
      'comfortable_travelling',
      'two_wheeler',
      'two_wheeler_available',
      'driving_license',
      'willing_to_travel',
      'field_travel'
    );
    const hasTwoWheelerMobility =
      valMobility.toLowerCase() === 'yes' ||
      valMobility.toLowerCase() === 'y' ||
      valMobility.toLowerCase() === 'true';

    const companyWork = getFieldValue(
      fields,
      'company_of_previous_work',
      'company_of_current_work',
      'previous_company',
      'current_company',
      'company_name',
      'current_organization'
    );

    return {
      passed: true,
      normalizedRole: 'HR Executive',
      questionnaire: {
        hr_experience_duration: valExpYears,
        multi_branch_experience: multiBranch,
        recruitment_experience: hasRecruitment,
        statutory_compliance: hasCompliance,
        two_wheeler_mobility: hasTwoWheelerMobility,
        malayalam_proficiency: speaksMalayalam,
        previous_company: companyWork || undefined,
        home_state: getFieldValue(fields, 'please_select_your_home_state', 'home_state', 'state', 'please_select') || 'Kerala',
        residing_city: getFieldValue(fields, 'residing_in_kochi', 'city', 'location') || 'Kochi',
      },
    };
  } else if (isGM) {
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

    let assignedRole = 'Cafe Staff / Barista';
    if (isBaristaOnly) assignedRole = 'Barista';
    else if (isCafeStaffOnly) assignedRole = 'Cafe Staff';

    return {
      passed: true, // Direct processing for all leads
      normalizedRole: assignedRole,
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
