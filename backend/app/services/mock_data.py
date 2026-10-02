"""Seeds fictional demo data so the prototype feels populated on first run.

All names, organizations, and resource entries below are fictional. Real
survivor or counselor information must never be placed here.
"""

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models.counselor import CounselorProfile, VerificationStatus
from app.models.group import Group
from app.models.identity import Identity, IdentityRole
from app.models.resource import Resource, ResourceCategory
from app.security import hash_secret
from app.services.nostr_service import get_nostr_service

_DEMO_PIN_HASH = hash_secret("0000")
_DEMO_RECOVERY_HASH = hash_secret("demo-seed-account-not-restorable")


def _mock_identity(db: Session, pseudonym: str, role: IdentityRole) -> Identity:
    nostr = get_nostr_service()
    keypair = nostr.generate_keypair(pseudonym)
    identity = Identity(
        pseudonym=pseudonym,
        role=role,
        npub=keypair.npub,
        avatar_seed=pseudonym.lower(),
        pin_hash=_DEMO_PIN_HASH,
        recovery_phrase_hash=_DEMO_RECOVERY_HASH,
    )
    db.add(identity)
    return identity


def seed(db: Session) -> None:
    if db.query(Identity).first() is not None:
        return  # already seeded

    survivors = [_mock_identity(db, name, IdentityRole.SURVIVOR) for name in ("Amani", "Nia", "Zawadi")]

    now = datetime.utcnow()
    counselor_defs = [
        ("Grace Wanjiru", VerificationStatus.VERIFIED, "African Trauma Counselors Network",
         "Trauma-informed counseling, survivor advocacy", "English, Swahili", now + timedelta(days=240)),
        ("Kwame Mensah", VerificationStatus.PENDING, "Awaiting review",
         "Family therapy, crisis support", "English, Twi", None),
        ("Fatima Ibrahim", VerificationStatus.EXPIRED, "West Africa GBV Support Alliance",
         "Legal-aware counseling, trauma recovery", "English, Hausa, French", now - timedelta(days=30)),
        ("Samuel Otieno", VerificationStatus.REVOKED, "East Africa Counseling Board",
         "General counseling", "English, Luo", None),
    ]
    counselors: list[CounselorProfile] = []
    for display_name, status, org, specialties, languages, expires_at in counselor_defs:
        identity = _mock_identity(db, display_name.split()[0], IdentityRole.COUNSELOR)
        db.flush()
        profile = CounselorProfile(
            identity_id=identity.id,
            display_name=display_name,
            bio=f"{display_name} supports survivors through {specialties.lower()}.",
            specialties=specialties,
            languages=languages,
            attesting_organization=org,
            verification_status=status,
            verification_expires_at=expires_at,
        )
        db.add(profile)
        counselors.append(profile)

    default_rules = (
        "Be kind — this is a space to support, not judge.\n"
        "Protect anonymity: never ask for real names or contact details.\n"
        "No advice-giving unless it's asked for.\n"
        "What's shared here stays here."
    )
    what_others_see = "Other members only ever see your nickname and messages — nothing else about your account."

    groups = [
        Group(name="Pregnancy Support", topic="Pregnancy & parenting",
              description="A space for survivors navigating pregnancy or early parenting to share and support each other.\n\n" + what_others_see,
              member_count=12, facilitator_name="Grace Wanjiru", requires_approval=True, rules=default_rules),
        Group(name="Recovery & Healing", topic="Trauma recovery",
              description="Peer support for longer-term healing after abuse or violence.\n\n" + what_others_see,
              member_count=27, facilitator_name="Kwame Mensah", requires_approval=True, rules=default_rules),
        Group(name="Legal Support", topic="Legal pathways",
              description="Understand your options and hear from others who have navigated legal processes.\n\n" + what_others_see,
              member_count=9, facilitator_name="Fatima Ibrahim", requires_approval=False, rules=default_rules),
        Group(name="Safe Conversations", topic="General peer support",
              description="An open, moderated space for everyday check-ins and mutual support.\n\n" + what_others_see,
              member_count=41, facilitator_name="Grace Wanjiru", requires_approval=False, rules=default_rules),
    ]
    db.add_all(groups)

    resources = [
        Resource(title="Nairobi Women's Legal Aid Clinic (demo)", category=ResourceCategory.LEGAL,
                 summary="Free legal consultations for survivors seeking protection orders.",
                 region="Nairobi, Kenya", contact="+254 700 000 000 (fictional)"),
        Resource(title="Accra Safe Shelter Network (demo)", category=ResourceCategory.SHELTER,
                 summary="Emergency and transitional shelter placements.",
                 region="Accra, Ghana", contact="shelter-demo@resilience.example"),
        Resource(title="Lagos Trauma Care Clinic (demo)", category=ResourceCategory.MEDICAL,
                 summary="Confidential medical care and forensic documentation support.",
                 region="Lagos, Nigeria", contact="+234 800 000 0000 (fictional)"),
        Resource(title="Know Your Rights: GBV Basics (demo)", category=ResourceCategory.EDUCATIONAL,
                 summary="A plain-language guide to legal protections available to survivors.",
                 region="Pan-African", contact="resources-demo@resilience.example"),
    ]
    db.add_all(resources)

    db.commit()
