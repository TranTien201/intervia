from app.schemas.role import Role

# Suggestions only: users can type any other role (`role_custom` in POST /api/sessions).
# Same list and order as the web mock (web/src/mocks/seed.ts).
ROLES: list[Role] = [
    Role(id="backend_engineer", name="Backend Engineer"),
    Role(id="ai_engineer", name="AI Engineer"),
    Role(id="frontend_engineer", name="Frontend Engineer"),
    Role(id="data_engineer", name="Data Engineer"),
]
