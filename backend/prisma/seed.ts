/**
 * Gade AMS — Prisma Seed
 * Run: npm run db:seed
 *
 * Seeds:
 *   1. Firm settings (singleton)
 *   2. Default users: BKM + DKK as Managing Partners
 *   3. Active clients from the Gade client registry
 *   4. Risk types library (ISA 315 mandatory + common risks per area)
 *   5. Procedure library stubs (to be expanded per ISA/ICPAK compliance matrix)
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Gade AMS database…');

  // ─── 1. Firm settings ──────────────────────────────────────────────────
  await prisma.firmSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      firmName: 'Gade Associates',
      firmPin: 'P051591395M',
      defaultPemPercent: 75.0,
      defaultTrivialPercent: 5.0,
    },
    update: {},
  });
  console.log('✓ Firm settings');

  // ─── 2. Default users ──────────────────────────────────────────────────
  // Passwords are temporary — users must change on first login and set up TOTP
  const defaultPassword = await bcrypt.hash('Gade@2026!', 12);

  const bkm = await prisma.user.upsert({
    where: { email: 'bkm@gadeassociates.co.ke' },
    create: {
      email: 'bkm@gadeassociates.co.ke',
      passwordHash: defaultPassword,
      firstName: 'Benard',
      lastName: 'Kichakuri',
      role: 'MANAGING_PARTNER',
      status: 'ACTIVE',
    },
    update: {},
  });

  const dkk = await prisma.user.upsert({
    where: { email: 'dkk@gadeassociates.co.ke' },
    create: {
      email: 'dkk@gadeassociates.co.ke',
      passwordHash: defaultPassword,
      firstName: 'Dennis',
      lastName: 'Korir',
      role: 'MANAGING_PARTNER',
      status: 'ACTIVE',
    },
    update: {},
  });

  console.log(`✓ Users: ${bkm.firstName} ${bkm.lastName}, ${dkk.firstName} ${dkk.lastName}`);

  // ─── 3. Clients ────────────────────────────────────────────────────────
  const clients = [
    { clientCode: 'C001', clientName: 'COMRED' },
    { clientCode: 'C002', clientName: 'Ceriops' },
    { clientCode: 'C003', clientName: 'Conventual Franciscan Friars' },
    { clientCode: 'H001', clientName: 'Hambaga Investments Kenya Limited' },
    { clientCode: 'H002', clientName: 'HSAUWC' },
    { clientCode: 'K001', clientName: 'Kivukoni Limited' },
    { clientCode: 'A001', clientName: 'Amari Tours and Travels Limited' },
    { clientCode: 'A004', clientName: 'The Afrijob Network Limited' },
    { clientCode: 'I003', clientName: 'InukaPap' },
  ];

  for (const c of clients) {
    await prisma.client.upsert({
      where: { clientCode: c.clientCode },
      create: { ...c, isActive: true },
      update: { clientName: c.clientName },
    });
  }
  console.log(`✓ ${clients.length} clients`);

  // ─── 4. Risk types (ISA 315 library) ──────────────────────────────────
  const riskTypes = [
    // ISA mandatory — cannot be rebutted
    {
      riskTypeCode: 'MGMT_OVERRIDE',
      riskName: 'Management Override of Controls',
      areaCode: 'ENTITY',
      isaReference: 'ISA 240.31, ISA 315',
      isAlwaysAssessed: true,
      isRebuttable: false,
      defaultLevel: 'HIGH' as const,
      significantRiskCriteria: 'ISA 240 mandates significant risk',
    },
    {
      riskTypeCode: 'REVENUE_FRAUD',
      riskName: 'Revenue Recognition Fraud',
      areaCode: 'N',
      isaReference: 'ISA 240.26',
      isAlwaysAssessed: true,
      isRebuttable: true,
      defaultLevel: 'HIGH' as const,
      significantRiskCriteria: 'ISA 240 presumed significant; rebuttable with documentation',
    },
    // Area-level risks (A-W)
    {
      riskTypeCode: 'CASH_EXISTENCE',
      riskName: 'Cash and Bank Balances — Existence',
      areaCode: 'A',
      isaReference: 'ISA 330',
      isAlwaysAssessed: false,
      isRebuttable: true,
      defaultLevel: 'LOW' as const,
    },
    {
      riskTypeCode: 'RECEIVABLES_VALUATION',
      riskName: 'Receivables — Valuation (Impairment)',
      areaCode: 'B',
      isaReference: 'IFRS 9, ISA 330',
      isAlwaysAssessed: false,
      isRebuttable: true,
      defaultLevel: 'MEDIUM' as const,
    },
    {
      riskTypeCode: 'INVENTORY_VALUATION',
      riskName: 'Inventories — Valuation (NRV)',
      areaCode: 'C',
      isaReference: 'IAS 2, ISA 330',
      isAlwaysAssessed: false,
      isRebuttable: true,
      defaultLevel: 'MEDIUM' as const,
    },
    {
      riskTypeCode: 'PPE_VALUATION',
      riskName: 'PPE — Valuation and Depreciation',
      areaCode: 'E',
      isaReference: 'IAS 16, ISA 330',
      isAlwaysAssessed: false,
      isRebuttable: true,
      defaultLevel: 'MEDIUM' as const,
    },
    {
      riskTypeCode: 'PPE_EXISTENCE',
      riskName: 'PPE — Existence and Rights',
      areaCode: 'E',
      isaReference: 'IAS 16, ISA 330',
      isAlwaysAssessed: false,
      isRebuttable: true,
      defaultLevel: 'LOW' as const,
    },
    {
      riskTypeCode: 'PAYABLES_COMPLETENESS',
      riskName: 'Trade Payables — Completeness',
      areaCode: 'H',
      isaReference: 'ISA 330',
      isAlwaysAssessed: false,
      isRebuttable: true,
      defaultLevel: 'MEDIUM' as const,
    },
    {
      riskTypeCode: 'BORROWINGS_EXISTENCE',
      riskName: 'Borrowings — Existence and Terms',
      areaCode: 'I',
      isaReference: 'ISA 330',
      isAlwaysAssessed: false,
      isRebuttable: true,
      defaultLevel: 'LOW' as const,
    },
    {
      riskTypeCode: 'EXPENSES_COMPLETENESS',
      riskName: 'Operating Expenses — Completeness and Cut-off',
      areaCode: 'P',
      isaReference: 'ISA 330',
      isAlwaysAssessed: false,
      isRebuttable: true,
      defaultLevel: 'MEDIUM' as const,
    },
    {
      riskTypeCode: 'GOING_CONCERN',
      riskName: 'Going Concern',
      areaCode: 'ENTITY',
      isaReference: 'ISA 570',
      isAlwaysAssessed: true,
      isRebuttable: true,
      defaultLevel: 'LOW' as const,
      significantRiskCriteria: 'Significant if indicators present',
    },
    {
      riskTypeCode: 'TAX_COMPLETENESS',
      riskName: 'Taxation — Completeness of Liability',
      areaCode: 'R',
      isaReference: 'IAS 12, ISA 330',
      isAlwaysAssessed: false,
      isRebuttable: true,
      defaultLevel: 'MEDIUM' as const,
    },
  ];

  for (const rt of riskTypes) {
    await prisma.riskType.upsert({
      where: { riskTypeCode: rt.riskTypeCode },
      create: { ...rt, isSeeded: true, isActive: true },
      update: { riskName: rt.riskName },
    });
  }
  console.log(`✓ ${riskTypes.length} risk types`);

  // ─── 5. Procedure library stubs ───────────────────────────────────────
  // A full procedure library will be populated in the Procedure Library Admin module.
  // These are minimal stubs to allow program generation to function.
  const procedures = [
    {
      procedureCode: 'CASH-001',
      areaCode: 'A',
      assertions: ['EXISTENCE', 'COMPLETENESS'],
      procedureText: 'Obtain bank confirmation letters directly from all banks as at period end.',
      isaReference: 'ISA 330.18',
      baseReqLevel: 'MANDATORY_ALL' as const,
      applicableFrameworks: ['IFRS_FOR_SMES', 'FULL_IFRS', 'IPSAS_ACCRUAL'] as never[],
    },
    {
      procedureCode: 'CASH-002',
      areaCode: 'A',
      assertions: ['EXISTENCE', 'ACCURACY'],
      procedureText: 'Reconcile bank confirmation balances to cash book and trial balance.',
      isaReference: 'ISA 330',
      baseReqLevel: 'MANDATORY_ALL' as const,
      applicableFrameworks: ['IFRS_FOR_SMES', 'FULL_IFRS', 'IPSAS_ACCRUAL'] as never[],
    },
    {
      procedureCode: 'REC-001',
      areaCode: 'B',
      assertions: ['EXISTENCE', 'VALUATION'],
      procedureText: 'Circularise debtors — send positive confirmation requests to a sample of trade receivables.',
      isaReference: 'ISA 330.19',
      baseReqLevel: 'RECOMMENDED_MEDIUM' as const,
      applicableFrameworks: ['IFRS_FOR_SMES', 'FULL_IFRS'] as never[],
    },
    {
      procedureCode: 'REC-002',
      areaCode: 'B',
      assertions: ['VALUATION'],
      procedureText: 'Assess adequacy of impairment allowance — review ageing analysis, subsequent receipts, and credit terms.',
      isaReference: 'ISA 330, IFRS 9',
      baseReqLevel: 'REQUIRED_HIGH' as const,
      applicableFrameworks: ['IFRS_FOR_SMES', 'FULL_IFRS'] as never[],
    },
    {
      procedureCode: 'PPE-001',
      areaCode: 'E',
      assertions: ['EXISTENCE', 'RIGHTS'],
      procedureText: 'Perform physical inspection of a sample of PPE items and agree to the fixed asset register.',
      isaReference: 'ISA 330',
      baseReqLevel: 'RECOMMENDED_MEDIUM' as const,
      applicableFrameworks: ['IFRS_FOR_SMES', 'FULL_IFRS', 'IPSAS_ACCRUAL'] as never[],
    },
    {
      procedureCode: 'PPE-002',
      areaCode: 'E',
      assertions: ['VALUATION', 'ACCURACY'],
      procedureText: 'Reperform depreciation calculations for a sample of asset classes and agree to the depreciation charge in the trial balance.',
      isaReference: 'ISA 330, IAS 16',
      baseReqLevel: 'REQUIRED_HIGH' as const,
      applicableFrameworks: ['IFRS_FOR_SMES', 'FULL_IFRS', 'IPSAS_ACCRUAL'] as never[],
    },
    {
      procedureCode: 'REV-001',
      areaCode: 'N',
      assertions: ['OCCURRENCE', 'ACCURACY', 'CUT_OFF'],
      procedureText: 'Test a sample of revenue transactions for occurrence — agree to invoices, delivery notes, and bank receipts.',
      isaReference: 'ISA 240.26, ISA 330',
      baseReqLevel: 'REQUIRED_HIGH' as const,
      applicableFrameworks: ['IFRS_FOR_SMES', 'FULL_IFRS', 'IPSAS_ACCRUAL'] as never[],
    },
    {
      procedureCode: 'REV-002',
      areaCode: 'N',
      assertions: ['CUT_OFF'],
      procedureText: 'Perform cut-off testing — review revenue transactions 5 days before and after period end.',
      isaReference: 'ISA 330',
      baseReqLevel: 'REQUIRED_HIGH' as const,
      applicableFrameworks: ['IFRS_FOR_SMES', 'FULL_IFRS'] as never[],
    },
    {
      procedureCode: 'MGMT-OVERRIDE-001',
      areaCode: 'ENTITY',
      assertions: ['OCCURRENCE', 'ACCURACY'],
      procedureText: 'Review journal entries — test journal entries and other adjustments for appropriateness, focusing on unusual or complex entries.',
      isaReference: 'ISA 240.32(a)',
      baseReqLevel: 'MANDATORY_ALL' as const,
      applicableFrameworks: ['IFRS_FOR_SMES', 'FULL_IFRS', 'IPSAS_ACCRUAL'] as never[],
    },
    {
      procedureCode: 'MGMT-OVERRIDE-002',
      areaCode: 'ENTITY',
      assertions: ['OCCURRENCE'],
      procedureText: 'Review accounting estimates for biases — evaluate whether estimates are consistent with the prior year and the entity\'s policies.',
      isaReference: 'ISA 240.32(b)',
      baseReqLevel: 'MANDATORY_ALL' as const,
      applicableFrameworks: ['IFRS_FOR_SMES', 'FULL_IFRS', 'IPSAS_ACCRUAL'] as never[],
    },
  ];

  for (const p of procedures) {
    await prisma.procedureLibrary.upsert({
      where: { procedureCode: p.procedureCode },
      create: { ...p, isCustom: false, isActive: true, version: 1 },
      update: { procedureText: p.procedureText },
    });
  }
  console.log(`✓ ${procedures.length} procedure library entries`);

  console.log('\n✅ Seed complete.');
  console.log('\n⚠️  Default password for all users: Gade@2026!');
  console.log('   Users will be prompted to set up TOTP on first login.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
