package com.gist.auth;

import com.gist.auth.dto.Credentials;
import com.gist.auth.dto.SessionResponse;
import com.gist.security.GistPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService service;

    public AuthController(AuthService service) {
        this.service = service;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public SessionResponse register(@RequestBody Credentials body) {
        return service.register(body.email(), body.password());
    }

    @PostMapping("/login")
    public SessionResponse login(@RequestBody Credentials body) {
        return service.login(body.email(), body.password());
    }

    /** Lets the app check a stored token on launch; 401 if it has expired. */
    @GetMapping("/me")
    public SessionResponse.UserView me(@AuthenticationPrincipal GistPrincipal user) {
        return new SessionResponse.UserView(user.uid(), user.email());
    }
}
