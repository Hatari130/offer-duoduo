"""Validate normalized recruitment JSON without mutating data or contacting a site."""
import argparse
import collections
import datetime as dt
import json
from pathlib import Path
import sys
from urllib.parse import urlparse

REQUIRED = set('source_job_id company_name job_title locations job_direction job_subdirection recruitment_category recruitment_type recruitment_project education_requirement major_requirement skills jd salary department published_at published_at_source last_verified_at verified_date source_list_url detail_url application_url'.split())
NULLABLE_TEXT = set('job_direction job_subdirection recruitment_category recruitment_type recruitment_project education_requirement major_requirement salary department'.split())
NONEMPTY = set('source_job_id company_name job_title jd published_at_source'.split())

def date_valid(value, date_only=False):
    if not isinstance(value, str):
        return False
    try:
        if len(value) == 10:
            return dt.date.fromisoformat(value).isoformat() == value
        if date_only:
            return False
        parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
        return parsed.tzinfo is not None
    except ValueError:
        return False

def validate(rows, expected=None):
    errors, warnings = [], []
    if not isinstance(rows, list):
        return {'valid': False, 'errors': ['Root must be an array'], 'warnings': []}
    keys, ids, companies, types = set(), collections.defaultdict(set), collections.Counter(), collections.Counter()
    known = 0
    if not rows:
        errors.append('Empty dataset: verify scope before integrating')
    if expected is not None and len(rows) != expected:
        errors.append(f'Expected {expected} rows, got {len(rows)}')
    for index, row in enumerate(rows):
        label = f'row {index + 1}'
        if not isinstance(row, dict):
            errors.append(f'{label}: must be an object')
            continue
        missing = REQUIRED - row.keys()
        if missing:
            errors.append(f'{label}: missing {", ".join(sorted(missing))}')
        for field in NONEMPTY:
            if not isinstance(row.get(field), str) or not row[field].strip():
                errors.append(f'{label}: {field} must be a nonempty string')
        for field in NULLABLE_TEXT:
            value = row.get(field)
            if value is not None and (not isinstance(value, str) or not value.strip()):
                errors.append(f'{label}: {field} must be null or nonempty string')
        for field in ('locations', 'skills'):
            value = row.get(field)
            if not isinstance(value, list) or any(not isinstance(v, str) or not v.strip() for v in value):
                errors.append(f'{label}: {field} must be an array of nonempty strings')
        for field in ('source_list_url', 'detail_url', 'application_url'):
            value = row.get(field)
            if not isinstance(value, str) or urlparse(value).scheme not in ('https', 'http') or not urlparse(value).netloc:
                errors.append(f'{label}: invalid {field}')
        pub = row.get('published_at')
        if pub is not None:
            known += 1
            if not date_valid(pub):
                errors.append(f'{label}: invalid published_at; use date or zoned ISO time')
        if not date_valid(row.get('verified_date'), date_only=True):
            errors.append(f'{label}: invalid verified_date')
        verified = row.get('last_verified_at')
        if not date_valid(verified) or (isinstance(verified, str) and len(verified) == 10):
            errors.append(f'{label}: last_verified_at must be a zoned ISO time')
        co, ident = row.get('company_name'), row.get('source_job_id')
        if isinstance(co, str) and isinstance(ident, str):
            key = (co, ident)
            if key in keys:
                errors.append(f'{label}: duplicate company + source ID: {key}')
            keys.add(key)
            ids[ident].add(co)
            companies[co] += 1
        typ = row.get('recruitment_type')
        if isinstance(typ, str) or typ is None:
            types[typ or '未确认'] += 1
    collisions = {ident: sorted(cos) for ident, cos in ids.items() if len(cos) > 1}
    if collisions:
        warnings.append('Cross-company source IDs collide; migrate UI/storage keys before integration')
    return {'valid': not errors, 'count': len(rows), 'unique': len(keys), 'companies': dict(companies), 'types': dict(types), 'published_known': known, 'published_unknown': len(rows)-known, 'cross_company_id_collisions': collisions, 'errors': errors, 'warnings': warnings, 'note': 'Structural validation only; source accuracy and completeness require official evidence.'}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file', type=Path)
    parser.add_argument('--expected', type=int)
    args = parser.parse_args()
    try:
        result = validate(json.loads(args.file.read_text(encoding='utf-8-sig')), args.expected)
    except (OSError, ValueError) as exc:
        result = {'valid': False, 'errors': [str(exc)], 'warnings': []}
    # ASCII escaping also works in legacy Windows consoles.
    print(json.dumps(result, ensure_ascii=True, indent=2))
    sys.exit(0 if result['valid'] else 1)
