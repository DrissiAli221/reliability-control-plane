package dev.ali.rcp;

import org.springframework.boot.SpringApplication;

public class TestRcpControlPlaneApplication {

    public static void main(String[] args) {
        SpringApplication.from(RcpControlPlaneApplication::main).with(TestcontainersConfiguration.class).run(args);
    }

}
