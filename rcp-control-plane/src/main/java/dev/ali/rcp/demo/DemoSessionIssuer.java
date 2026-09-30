package dev.ali.rcp.demo;

/** Signs a visitor in as the shared demo account. Exactly one implementation is active per environment. */
public interface DemoSessionIssuer {
    DemoSession issue();
}
