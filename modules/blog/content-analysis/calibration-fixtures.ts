import type { ContentAnalysisInput } from "../blog-content-analysis";

export type CalibrationCase = {
  id: string;
  name: string;
  expect: "excellent" | "strong" | "good" | "average" | "poor" | "empty";
  input: ContentAnalysisInput;
};

const excellentHrms = `
<h2>What is an HRMS?</h2>
<p>An HRMS (Human Resource Management System) is software that centralizes employee data, payroll inputs, attendance, leave, and workflows in one system. Unlike a spreadsheet, it enforces permissions, audit trails, and process steps.</p>
<p>For example, a 120-person company in India can run joining, leave approval, and payroll cut-off from the same employee record instead of three disconnected tools.</p>
<h2>Core HRMS modules</h2>
<p>A practical HRMS usually includes employee records, attendance, leave, payroll inputs, document storage, and reporting. Each module should share one employee identifier so data does not drift.</p>
<ol>
<li>Create the employee master with legal name, joining date, and compensation.</li>
<li>Connect attendance and leave so payroll receives approved exceptions only.</li>
<li>Publish self-service for payslips and letters after payroll is locked.</li>
</ol>
<h3>Where HRMS differs from HRIS</h3>
<p>HRIS typically stores employee records. HRMS extends into transactions: approvals, payroll inputs, and automation. Compared with an HRIS, an HRMS reduces hand-offs between HR and finance.</p>
<h2>Implementation workflow</h2>
<p>In practice, implementation fails when companies skip data cleanup. If an employee has two employee codes, overtime and leave will not match.</p>
<p>However, contractors and part-time staff often need a different policy set. Configure those exceptions before go-live rather than after the first payroll cycle.</p>
<table><thead><tr><th>Step</th><th>Owner</th><th>Typical duration</th></tr></thead>
<tbody><tr><td>Data audit</td><td>HR</td><td>5–10 days</td></tr>
<tr><td>Workflow design</td><td>HR + IT</td><td>7 days</td></tr>
<tr><td>Parallel payroll</td><td>Finance</td><td>1–2 cycles</td></tr></tbody></table>
<h2>Integration and reporting</h2>
<p>HRMS reporting should answer headcount, attrition, and payroll-ready attendance in under 60 seconds. Integration with banking or accounting is useful only after the employee master is stable. A typical 2024 rollout for 120 employees takes 6–8 weeks if the master data is clean.</p>
<p>Unlike a custom spreadsheet, the HRMS should log who changed a salary field and when.</p>
<ul>
<li>Employee self-service for letters and tax inputs</li>
<li>Manager workflows for leave and overtime</li>
<li>Audit reports for compensation changes</li>
</ul>
<h2>FAQ</h2>
<h3>What is an HRMS used for?</h3>
<p>An HRMS is used to manage the employee lifecycle: records, attendance, leave, payroll inputs, and compliance documents in one workflow.</p>
<h3>How is an HRMS different from payroll software?</h3>
<p>Payroll software calculates pay. An HRMS feeds payroll with approved employee, attendance, and deduction data and keeps the master record after payday.</p>
<h3>When should a company replace spreadsheets?</h3>
<p>Replace spreadsheets when two teams edit the same employee data, or when joiners, leave, and payroll no longer reconcile at month-end.</p>
<p>In summary, choose an HRMS for shared employee data, controlled workflows, and payroll-ready reporting — not for branding slogans.</p>
<p>See also <a href="/blog/payroll-process">payroll process</a>, <a href="/blog/attendance-policy">attendance policy</a>, and <a href="/hrms">HRMS product overview</a>.</p>
<p>Further reading: <a href="https://www.shrm.org">SHRM</a> and <a href="https://www.ilo.org">ILO</a>.</p>
<img src="/hrms.png" alt="HRMS workflow from employee master to payroll" />
`;

const excellentPayroll = `
<h2>What is a salary structure?</h2>
<p>A salary structure is the breakdown of Cost to Company (CTC) into basic, allowances, employer contributions, and deductions that produce net pay. CTC is not the same as take-home salary.</p>
<p>For example, a CTC of INR 600,000 may yield a lower monthly net pay after provident fund, professional tax, and income tax.</p>
<h2>How to calculate net pay</h2>
<ol>
<li>Start with gross (basic + allowances).</li>
<li>Subtract statutory and voluntary deductions.</li>
<li>Add reimbursements that are paid, then arrive at net pay.</li>
</ol>
<p>If an employee is a contractor, do not run the same PF logic as a full-time employee. That exception belongs in the payroll calendar, not in a one-off spreadsheet.</p>
<h3>Worked example</h3>
<p>Monthly CTC equivalent: INR 50,000. Basic 40% = INR 20,000. Employee PF at 12% of basic = INR 2,400, subject to the applicable wage ceiling and policy. Always confirm the current EPFO rule before locking payroll.</p>
<table><thead><tr><th>Component</th><th>Amount (INR)</th></tr></thead>
<tbody><tr><td>Basic</td><td>20,000</td></tr><tr><td>HRA</td><td>10,000</td></tr><tr><td>Special allowance</td><td>20,000</td></tr><tr><td>Gross</td><td>50,000</td></tr></tbody></table>
<h2>Payslip and compliance inputs</h2>
<p>A payslip should show earnings, deductions, net pay, and year-to-date totals. Payroll compliance depends on correct employee tax status, not on the template design.</p>
<ul>
<li>Lock attendance before payroll</li>
<li>Review new joiners and exits</li>
<li>Reconcile PF, ESI, and TDS worksheets</li>
</ul>
<h2>FAQ</h2>
<h3>What is the difference between CTC and net pay?</h3>
<p>CTC is the employer’s total annual cost. Net pay is what the employee receives after deductions.</p>
<h3>How do deductions affect salary?</h3>
<p>Deductions such as PF, professional tax, and TDS reduce gross to net. Each has its own eligibility and ceiling.</p>
<p>In summary, publish salary structures with a worked example, not generic adjectives.</p>
<p><a href="/blog/indian-payroll-compliance">Indian payroll compliance</a> · <a href="/blog/pf-guide">PF guide</a> · <a href="/payroll">Payroll software</a></p>
<p>Sources: <a href="https://www.epfo.gov.in">EPFO</a> and <a href="https://www.incometax.gov.in">Income Tax Department</a>.</p>
<img src="/salary.png" alt="Salary structure showing CTC versus net pay" />
`;

const excellentCompliance = `
<h2>What is Indian payroll compliance?</h2>
<p>Indian payroll compliance is the set of statutory processes an employer must follow when paying employees: provident fund, ESI where applicable, tax deducted at source, professional tax, and related filings. It is administered by authorities such as EPFO, ESIC, and the Income Tax Department.</p>
<h2>PF contributions</h2>
<p>Employees generally contribute 12% of the designated wage to EPF, and employers contribute a matching amount, subject to the wage ceiling and current EPFO notifications. For example, if basic pay is INR 15,000, employee PF is INR 1,800 before any ceiling is applied. Confirm the live ceiling on the EPFO portal before you configure payroll, because circulars change.</p>
<p>According to <a href="https://www.epfo.gov.in">EPFO</a>, UAN seeding and timely ECR filing are required. Due dates and penalties are published by EPFO, not by vendor blogs.</p>
<h3>Eligibility and exceptions</h3>
<p>However, international workers and certain excluded employees follow different rules. If an employee’s pay is above the PF wage ceiling, some employers limit PF to the ceiling while others contribute on full basic — that policy must be documented.</p>
<h2>ESI and TDS</h2>
<p>ESI applicability depends on the wage threshold notified by ESIC. See <a href="https://www.esic.gov.in">ESIC</a> for the current threshold. TDS follows the Income Tax Act slabs and declarations on file with the employer. See the <a href="https://www.incometax.gov.in">Income Tax Department</a>.</p>
<ol>
<li>Map each employee to PF, ESI, and tax regimes.</li>
<li>Calculate contributions against the correct wage base.</li>
<li>File returns by the statutory due date and archive challans.</li>
</ol>
<table><thead><tr><th>Item</th><th>Authority</th><th>What to verify</th></tr></thead>
<tbody>
<tr><td>EPF</td><td>EPFO</td><td>Wage base, 12% rate, ceiling, ECR</td></tr>
<tr><td>ESI</td><td>ESIC</td><td>Wage threshold, contribution split</td></tr>
<tr><td>TDS</td><td>Income Tax Department</td><td>Regime, proofs, Form 16</td></tr>
</tbody></table>
<h2>Documentation and penalties</h2>
<p>Keep appointment letters, wage registers, and challans. Penalties for delayed PF remittance are defined by EPFO; do not invent a percentage. Check the Ministry of Labour &amp; Employment and EPFO for the applicable interest and damages.</p>
<ul>
<li>Wage register and attendance</li>
<li>PF/ESI challans</li>
<li>TDS returns and Form 16</li>
</ul>
<h2>FAQ</h2>
<h3>Who must register for PF?</h3>
<p>Applicability depends on headcount and establishment type as defined in the EPF Act and EPFO instructions. Verify on <a href="https://www.epfo.gov.in">epfo.gov.in</a>.</p>
<h3>What wage is used for the 12% PF contribution?</h3>
<p>Use the wage components EPFO treats as PF wages, then apply the current ceiling if your policy uses it. Do not copy a blog number without checking the circular.</p>
<p>In summary, payroll compliance is a dated, authority-specific process. Cite EPFO, ESIC, and the Income Tax Department next to every rate and threshold.</p>
<p><a href="/blog/salary-structure">Salary structure</a> · <a href="/blog/esi-guide">ESI guide</a> · <a href="/payroll">Payroll</a></p>
<img src="/compliance.png" alt="Indian payroll compliance flow from wages to statutory filings" />
`;

const excellentRecruitment = `
<h2>What is a structured hiring process?</h2>
<p>A structured hiring process is a repeatable sequence of sourcing, screening, interviewing, offering, and onboarding that uses the same scorecards for every candidate in a role.</p>
<h2>Sourcing and screening</h2>
<p>For example, a 30-day requisition for a payroll executive can use one job description, a 10-minute screening rubric, and a two-interview panel. Compared with ad-hoc hiring, this reduces time-to-offer and bias from unstructured chats.</p>
<ol>
<li>Publish the scorecard before sourcing.</li>
<li>Screen for must-have skills only.</li>
<li>Interview with the same questions and a written recommendation.</li>
</ol>
<h3>Offer and onboarding</h3>
<p>If a candidate is a contractor, do not send a full-time appointment letter. That exception belongs in the offer checklist.</p>
<ul>
<li>Background verification</li>
<li>Document collection</li>
<li>Day-1 system access</li>
</ul>
<table><thead><tr><th>Stage</th><th>SLA</th></tr></thead><tbody><tr><td>Screen</td><td>3 days</td></tr><tr><td>Interview</td><td>7 days</td></tr><tr><td>Offer</td><td>2 days</td></tr></tbody></table>
<h2>FAQ</h2>
<h3>How do you reduce time-to-hire?</h3>
<p>Freeze the scorecard, run parallel interview slots, and issue offers within 48 hours of the final round.</p>
<h3>What should onboarding include?</h3>
<p>Onboarding should include documents, equipment, policy acknowledgement, and a 30-day manager check-in.</p>
<h2>Metrics that matter</h2>
<p>Track time-to-hire in days, offer-accept rate, and 90-day retention. In practice, a 25-person HR team can cut time-to-hire from 45 days to 28 days by freezing the scorecard and running two interview panels per week.</p>
<p>In summary, recruitment quality is process control, not more adjectives about “talent.”</p>
<p><a href="/blog/onboarding-checklist">Onboarding checklist</a> · <a href="/blog/offer-letter">Offer letters</a> · <a href="/hrms">HRMS</a></p>
<p>See <a href="https://www.shrm.org">SHRM</a> for structured interview research.</p>
<img src="/hire.png" alt="Structured hiring stages from sourcing to onboarding" />
`;

export const CALIBRATION_CASES: CalibrationCase[] = [
  {
    id: "1-excellent-hrms",
    name: "Excellent HRMS article",
    expect: "excellent",
    input: {
      title: "What Is an HRMS? Modules, Workflow, and Implementation",
      keywords: ["hrms", "hr technology", "employee data"],
      metaDescription:
        "Learn what an HRMS is, how modules share employee data, and a practical implementation workflow HR teams can follow in India.",
      permalink: "what-is-an-hrms-modules-workflow",
      author: "Officekit HR Editorial",
      categoryName: "HRMS & HR Technology",
      featuredImageUrl: "/hrms.png",
      contentHtml: excellentHrms,
    },
  },
  {
    id: "2-poor-generic",
    name: "Poor generic HR article",
    expect: "poor",
    input: {
      title: "Unlock the Power of HR in Today's Fast-Paced World",
      keywords: ["hr"],
      metaDescription: "HR is important for every company in the digital world.",
      permalink: "unlock-hr-power",
      categoryName: "HR Trends & Insights",
      contentHtml: `<p>In today's fast-paced world, HR is a game-changer. It goes without saying that organizations must unlock the power of their people and leverage synergies across the ever-evolving landscape. Needless to say, a holistic approach will revolutionize your workforce and seamlessly integrate cutting-edge solutions. At the end of the day, HR empowers your team to navigate the complexities of work. Contact sales to get started today and book a demo for guaranteed results.</p>`,
    },
  },
  {
    id: "3-excellent-payroll",
    name: "Excellent payroll article",
    expect: "excellent",
    input: {
      title: "Salary Structure Explained: CTC, Gross, and Net Pay",
      keywords: ["salary structure", "ctc", "net pay"],
      metaDescription:
        "See how CTC, gross, deductions, and net pay fit together, with a worked INR example and payslip checks for Indian payroll teams.",
      permalink: "salary-structure-ctc-gross-net-pay",
      author: "Officekit HR Editorial",
      categoryName: "Payroll & Salary",
      featuredImageUrl: "/salary.png",
      contentHtml: excellentPayroll,
    },
  },
  {
    id: "4-poor-payroll",
    name: "Poor payroll article",
    expect: "poor",
    input: {
      title: "Payroll Software Benefits",
      keywords: ["payroll software"],
      metaDescription: "Payroll software is the best-in-class way to pay people.",
      permalink: "payroll-software-benefits",
      categoryName: "Payroll & Salary",
      contentHtml: `<h2>Why it matters</h2><p>In today's digital world, payroll software is a game-changer. Unlock the power of payroll and revolutionize your finance team. It is industry-leading and world-class. Book a demo and start your free trial today.</p><h2>Benefits</h2><p>Payroll software helps with payroll. Payroll is important. Companies need payroll.</p>`,
    },
  },
  {
    id: "5-excellent-compliance",
    name: "Excellent HR compliance article",
    expect: "excellent",
    input: {
      title: "Indian Payroll Compliance: A Step-by-Step Guide",
      keywords: ["payroll compliance", "pf", "esi", "tds"],
      metaDescription:
        "A step-by-step Indian payroll compliance guide covering PF, ESI, and TDS, with EPFO, ESIC, and Income Tax Department sources.",
      permalink: "indian-payroll-compliance-step-by-step",
      author: "Officekit HR Editorial",
      categoryName: "HR Compliance",
      featuredImageUrl: "/compliance.png",
      contentHtml: excellentCompliance,
    },
  },
  {
    id: "6-poor-compliance",
    name: "Poor compliance article",
    expect: "poor",
    input: {
      title: "Indian Payroll Compliance: A Step-by-Step Guide",
      keywords: ["payroll compliance", "pf"],
      metaDescription: "Everything you need to know about Indian payroll compliance for modern teams.",
      permalink: "indian-payroll-compliance-step-by-step",
      categoryName: "HR Compliance",
      contentHtml: `<h2>Introduction</h2><p>In today's fast-paced world, payroll compliance is a game-changer. Employees must contribute 12%. Studies show 87% of companies are non-compliant. Experts say you should buy our software. According to a 2024 study, automation guarantees results.</p><h2>Conclusion</h2><p>Unlock the power of compliance and contact sales to get started today.</p>`,
    },
  },
  {
    id: "7-excellent-recruitment",
    name: "Excellent recruitment article",
    expect: "strong",
    input: {
      title: "A Structured Hiring Process From Sourcing to Onboarding",
      keywords: ["hiring process", "onboarding", "recruitment"],
      metaDescription:
        "Build a structured hiring process with scorecards, SLAs, screening steps, and an onboarding checklist HR teams can reuse.",
      permalink: "structured-hiring-process-onboarding",
      author: "Officekit HR Editorial",
      categoryName: "Recruitment & Onboarding",
      featuredImageUrl: "/hire.png",
      contentHtml: excellentRecruitment,
    },
  },
  {
    id: "8-thin-ai",
    name: "Thin AI-generated article",
    expect: "poor",
    input: {
      title: "The Future of HR",
      keywords: ["future of hr"],
      metaDescription: "Explore the future of HR and why it matters for every organization in a digital age.",
      permalink: "future-of-hr",
      categoryName: "HR Trends & Insights",
      contentHtml: `<p>The future of HR is exciting and full of possibility for every modern organization. Organizations must adapt as work changes. Technology will help in many ways. People remain important. In today's digital world, leaders should empower your workforce and navigate the complexities of change across the ever-evolving landscape. This is a cutting-edge solution for modern teams that want to unlock the power of talent and leverage synergies.</p>`,
    },
  },
  {
    id: "9-keyword-stuffed",
    name: "Keyword-stuffed article",
    expect: "poor",
    input: {
      title: "Payroll Software Payroll Software Payroll Software",
      keywords: ["payroll software"],
      metaDescription:
        "Payroll software payroll software payroll software payroll software payroll software payroll software payroll software.",
      permalink: "payroll-software-payroll-software",
      categoryName: "Payroll & Salary",
      contentHtml: `<h2>Payroll software</h2><p>Payroll software payroll software payroll software is the best payroll software. Buy payroll software because payroll software payroll software payroll software payroll software. Companies need payroll software payroll software payroll software to run payroll software every month with payroll software.</p><h2>More payroll software</h2><p>Payroll software payroll software payroll software payroll software payroll software payroll software.</p>`,
    },
  },
  {
    id: "10-poorly-sourced",
    name: "Well-written but poorly sourced compliance article",
    expect: "average",
    input: {
      title: "Indian Payroll Compliance: A Step-by-Step Guide",
      keywords: ["payroll compliance", "pf", "esi"],
      metaDescription:
        "Walk through Indian payroll compliance including PF, ESI, and TDS with process steps HR and finance teams can follow.",
      permalink: "indian-payroll-compliance-step-by-step",
      author: "Aarav Mehta",
      categoryName: "HR Compliance",
      contentHtml: `<h2>What is Indian payroll compliance?</h2>
<p>Indian payroll compliance is the process of calculating and filing statutory contributions when you run payroll in India. It includes provident fund, ESI where applicable, TDS, professional tax, and the documentation that proves filings happened on time.</p>
<p>Employees must contribute 12% to PF and employers match it. ESI applies below a wage threshold that changes by notification. Due dates and penalties matter, but this article does not quote an official circular.</p>
<h2>How to stay compliant</h2>
<ol>
<li>Register with the right authorities and map each employee to PF, ESI, and tax status.</li>
<li>Calculate contributions against the correct wage base each month.</li>
<li>File returns before the due date and keep challans with the wage register.</li>
</ol>
<p>For example, a 40-employee company should reconcile PF before payday. However, contractors and part-time staff may be excluded depending on the contract. Documentation should include appointment letters, attendance, and proof of remittance.</p>
<h3>Applicability and eligibility</h3>
<p>Applicability depends on headcount and establishment type. Eligibility for ESI is wage-based. Always confirm the current threshold before configuring payroll.</p>
<h2>FAQ</h2>
<h3>What is the PF rate?</h3>
<p>Employees must contribute 12%. This article does not cite the EPFO primary source for that figure.</p>
<h3>What records should you keep?</h3>
<p>Keep wage registers, attendance, PF and ESI challans, and TDS returns so an inspector can reconstruct a month.</p>
<p>In summary, the process is clear, but the rates and ceilings here are unsourced.</p>
<p><a href="/blog/payroll">Payroll basics</a></p>
<p>Source: <a href="https://medium.com/hr-payroll-notes/pf-rates">a popular HR blog</a>.</p>`,
    },
  },
  {
    id: "11-empty",
    name: "Empty content",
    expect: "empty",
    input: {
      title: "What Is Payroll Software",
      keywords: ["payroll software"],
      metaDescription: "Learn what payroll software is and how HR teams use it to pay employees accurately each month.",
      permalink: "what-is-payroll-software",
      categoryName: "Payroll & Salary",
      contentHtml: "",
    },
  },
];
