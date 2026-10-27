package com.gist.auth;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, UUID> {

    /** Callers pass the normalized address; see {@link AuthService}. */
    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);
}
