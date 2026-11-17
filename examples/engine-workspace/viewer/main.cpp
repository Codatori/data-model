#include "RenderContext.hpp"

class Application {
public:
    void render(Engine::SceneManager& manager, int frame_id);
};

void Application::render(Engine::SceneManager& manager, int frame_id) {
    manager.update_scene(frame_id);
}

int main() {
    using namespace Engine;

    auto manager = std::make_shared<SceneManager>("MainGameLevel");

    auto context = std::make_shared<RenderContext>(42, manager.get());

    manager->set_render_context(context);

    Application application;
    application.render(*manager, 42);

    std::cout << "--- Starting execution flow --- \\n";
    manager->update_scene();

    return 0;
}
