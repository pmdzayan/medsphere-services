# Provider Verification — Official Authority Source Policy

## Purpose

AIM provider verification must be traceable to the competent official authority.
A platform reviewer must be able to see which official source(s) are relevant to
the submitted provider and open those sources directly.

Official source links are controlled by AIM code. Providers cannot submit,
replace, or override these URLs through `governmentIdReference` or any other
verification field.

## Source classes

- **PRIMARY** — statutory licence/registration evidence expected for the
  provider/jurisdiction.
- **SUPPORTING** — useful registry/accreditation evidence that does not replace
  the statutory authority.
- **CONDITIONAL** — required only when the corresponding identifier or legal
  structure applies.

Multiple sources are expected when different authorities prove different facts.

## India / Tamil Nadu accepted source catalogue

| Provider | Requirement | Authority / source | Purpose |
| --- | --- | --- | --- |
| Pharmacy in Tamil Nadu | PRIMARY | Tamil Nadu Drugs Control — https://drugscontrol.tn.gov.in/sales_services.html | Pharmacy premises / drug-sale licence |
| Pharmacy in Tamil Nadu | PRIMARY | Tamil Nadu Pharmacy Council — https://tnpc.ac.in/ | Pharmacist professional registration |
| Pharmacy / hospital / clinic / lab | SUPPORTING | ABDM Health Facility Registry — https://facility.abdm.gov.in/ | Facility identity in the digital-health ecosystem |
| Doctor | PRIMARY | National Medical Commission Indian Medical Register — https://www.nmc.org.in/information-desk/indian-medical-register/ | Doctor registration |
| Doctor | SUPPORTING | ABDM Healthcare Professionals Registry — https://hpr.abdm.gov.in/ | Digital-health professional identity |
| Hospital / clinic / lab in Tamil Nadu | PRIMARY | Tamil Nadu Clinical Establishments — https://www.tnhealth.org/dms/tncea/Others_upload.php | State clinical-establishment registration |
| Hospital / clinic / lab outside configured State-specific rules | CONDITIONAL | Central Clinical Establishments National Register — https://clinicalestablishments.mohfw.gov.in/portal/cerrs/national-register | Use only where the Central Act applies |
| Laboratory | SUPPORTING | NABL — https://nabl-india.org/ | Laboratory accreditation / quality evidence |
| Applicable business | CONDITIONAL | GST Search Taxpayer — https://services.gst.gov.in/services/quicklinks/searchtxp | Tax/business identity |
| Company / LLP | CONDITIONAL | Ministry of Corporate Affairs — https://www.mca.gov.in/ | Legal-entity identity |

For pharmacies outside Tamil Nadu, AIM links to the official national directories
that identify the competent State authorities:

- CDSCO State Drugs Control directory:
  https://cdsco.gov.in/opencms/opencms/en/State-Drugs-Control/
- Pharmacy Council of India State Pharmacy Council directory:
  https://www.pci.gov.in/en/state-pharmacy-council-list/

A directory link is not itself proof that the licence/registration is current;
the reviewer follows it to the competent State authority.

## Fail-closed rules

1. HFR/HPR, GST, MCA, or NABL must never be treated as a substitute for a
   statutory provider/professional licence where one is required.
2. For Tamil Nadu pharmacies, both the drug-sale/premises licensing source and
   pharmacist-registration source are primary sources.
3. For Tamil Nadu hospitals, clinics, and laboratories, use the State clinical
   establishment framework rather than assuming the Central Clinical
   Establishments register applies.
4. For laboratories, NABL is supporting accreditation evidence, not the
   statutory facility registration.
5. If AIM has no accepted source catalogue for a country/provider type, return
   `jurisdictionReviewRequired=true` and do not invent an authority.
6. A provider-supplied URL is never an official source. Source URLs are selected
   only from the server-owned catalogue.
7. External official sites are opened by the reviewer/user; AIM does not scrape
   portals, bypass CAPTCHA, or infer approval from page availability.
8. A future official API integration requires its own security/privacy review,
   authentication/credential design, rate-limit handling, evidence retention,
   and fail-closed behavior.
9. Source-site failure or unavailability must never convert into automatic
   approval.
10. Every final approval remains a consequential platform action subject to the
    existing provider-scoped serialization, authorization, audit, and
    verification state machine.

## Privacy

The public URLs in this catalogue contain no provider-specific identifiers.
AIM does not append license numbers, professional registration numbers,
government references, patient data, or tenant IDs to an official-source URL.

The existing `governmentIdReference` remains an opaque evidence reference and
continues to reject URL/path/URI syntax.
