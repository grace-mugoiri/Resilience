"""gRPC admission server consumed by both private nostr-rs-relay instances."""

from concurrent import futures

import grpc
from sqlalchemy.orm import Session

from app.db.session import get_engine
from app.relay import nauthz_pb2, nauthz_pb2_grpc
from app.relay.policy import AdmissionEvent, decide
from app.settings import get_settings


class Authorization(nauthz_pb2_grpc.AuthorizationServicer):
    def EventAdmit(self, request, context):  # noqa: N802 - protobuf method name
        settings = get_settings()
        event = request.event
        admission_event = AdmissionEvent(
            pubkey=bytes(event.pubkey).hex(),
            created_at=event.created_at,
            kind=event.kind,
            tags=[list(tag.values) for tag in event.tags],
        )
        auth_pubkey = bytes(request.auth_pubkey).hex() if request.HasField("auth_pubkey") else None
        try:
            with Session(get_engine()) as db:
                result = decide(db, admission_event, auth_pubkey, settings)
        except Exception:
            # The relay itself is fail-open when this service is unavailable. While reachable,
            # this service must fail closed on database or policy errors.
            return nauthz_pb2.EventReply(
                decision=nauthz_pb2.DECISION_DENY,
                message="error: relay policy unavailable",
            )
        return nauthz_pb2.EventReply(
            decision=(nauthz_pb2.DECISION_PERMIT if result.permit else nauthz_pb2.DECISION_DENY),
            message=result.message,
        )


def main() -> None:
    settings = get_settings()
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=8))
    nauthz_pb2_grpc.add_AuthorizationServicer_to_server(Authorization(), server)
    server.add_insecure_port(f"0.0.0.0:{settings.relay_policy_port}")
    server.start()
    server.wait_for_termination()


if __name__ == "__main__":
    main()
